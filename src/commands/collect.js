import { config } from '../config.js';
import { allRows } from '../nerdb.js';
import { DICT } from '../dict.js';
import { split, isCandidate } from '../normalize.js';
import { translateTail } from '../tail.js';
import { translateTexts, translateContextual } from '../llm.js';
import { readJson, writeJson, readState, updateState, FILES } from '../storage.js';
import { progress } from '../util.js';

const clean = (pt, original) =>
{
    const v = (pt ?? '').trim();
    return v === '' || v.toLowerCase() === original.toLowerCase() ? null : v;
};

export async function collect({ rows = Infinity, from = null, to = Infinity, full = false } = {})
{
    const state = await readState();
    const start = from ?? (full ? 0 : state.collected_id);

    const cache = await readJson(FILES.cache, {});
    cache.texts ??= {};   // chave minúscula -> { pt|null, ambiguous }
    cache.rows  ??= {};   // row id -> pt|null (casos ambíguos, traduzidos com contexto)

    // Contagens acumuladas entre execuções. countedId evita contar a mesma linha duas vezes
    // (retomada após falha, --from sobreposto). --full zera e recontabiliza tudo.
    if (full) { cache.counts = {}; cache.countedId = 0; }
    cache.counts    ??= {};   // chave minúscula -> { text, count }
    cache.countedId ??= 0;

    const prevTranslations = await readJson(FILES.translations, {});
    const prevContextual   = await readJson(FILES.contextual, []);

    // 1. Varre só o intervalo pedido (por padrão, o que é novo desde o último collect).
    const records = [];
    let lastId = start;

    const scan = progress('Varrendo NERDB', Number.isFinite(rows) ? rows : null);
    let read = 0;

    for await (const row of allRows({ from: start, to, max: rows }))
    {
        lastId = Math.max(lastId, row.id);
        scan.update(++read, `id ${row.id}`);

        const { base, tail } = split(row.movie_character);
        if (!isCandidate(base)) continue;

        const key = base.toLowerCase();

        if (row.id > cache.countedId)
        {
            const entry = cache.counts[key] ??= { text: base, count: 0 };
            entry.count++;
        }

        records.push({
            id: row.id, key, tail, before: row.movie_character,
            title: row.title_br, year: row.release_year, person: row.person_name,
        });
    }

    scan.done();

    cache.countedId = Math.max(cache.countedId, lastId);
    await writeJson(FILES.cache, cache);

    console.log(`Lidas ${records.length} linhas candidatas (ids ${start + 1} a ${lastId}).`);

    // 2. IA por texto único, dos mais frequentes para os menos (nomes próprios ficam de fora).
    //    Textos que já passaram pela IA (cache.texts) nunca voltam a ser enviados.
    const pending = Object.entries(cache.counts)
        .filter(([key, e]) => !(key in DICT) && !(key in cache.texts) && e.count >= config.minCount)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([key, e]) => ({ key, text: e.text }));

    console.log(`${Object.keys(cache.counts).length} textos únicos no total, ${pending.length} novos vão para a IA (mínimo ${config.minCount} ocorrências).`);

    const bar = progress('IA · textos', pending.length);
    
    for (let i = 0; i < pending.length; i += config.batch)
    {
        const batch = pending.slice(i, i + config.batch);
        bar.update(i, `"${batch[0].text}"…`);   // mostra o que está sendo traduzido agora
        
        try
        {
            let got = 0;

            for (const r of await translateTexts(batch.map(b => b.text)))
            {
                const item = batch[Number(r.id)];
                if (!item) continue;

                cache.texts[item.key] = { pt: clean(r.pt, item.text), ambiguous: Boolean(r.ambiguous) };
                got++;
            }

            if (got < batch.length) console.warn(`Lote ${i / config.batch + 1}: ${batch.length - got} sem resposta (serão retentados).`);
        }
        catch (error) { bar.log(`Lote ${i / config.batch + 1} falhou: ${error.message}`); }

        await writeJson(FILES.cache, cache);
        bar.update(Math.min(i + config.batch, pending.length));
    }

    bar.done();

    // 3. translations.json: merge. Entradas existentes mantêm pt e skip (inclusive edições manuais);
    //    só o contador é atualizado. O dicionário sempre vence. Ordenado por frequência.
    const translations = {};

    for (const [key, e] of Object.entries(cache.counts).sort((a, b) => b[1].count - a[1].count))
    {
        const inDict = key in DICT;
        const prev   = prevTranslations[key];
        const c      = cache.texts[key];
        const pt     = inDict ? DICT[key] : (prev?.pt ?? (c && !c.ambiguous ? c.pt : null));

        if (!pt) continue;

        translations[key] = {
            count: e.count, pt,
            source: inDict ? 'dict' : (prev?.source ?? 'llm'),
            skip: prev?.skip ?? false,
        };
    }

    await writeJson(FILES.translations, translations);

    // 4. Ambíguos (gênero/contexto) das linhas novas: a IA decide linha a linha.
    const ambiguous = records.filter(r => !(r.key in DICT) && cache.texts[r.key]?.ambiguous);
    const todo      = ambiguous.filter(r => !(r.id in cache.rows));

    console.log(`${ambiguous.length} linhas ambíguas no intervalo, ${todo.length} a traduzir com contexto.`);

    for (let i = 0; i < todo.length; i += config.batch)
    {
        const batch = todo.slice(i, i + config.batch);

        try
        {
            const input = batch.map(r => ({
                id: r.id, character: cache.counts[r.key].text, movie: r.title, year: r.year, person: r.person,
            }));

            for (const r of await translateContextual(input))
            {
                const rec = batch.find(b => b.id === Number(r.id));
                if (rec) cache.rows[rec.id] = clean(r.pt, cache.counts[rec.key].text);
            }
        }
        catch (error) { console.error(`Lote contextual ${i / config.batch + 1} falhou: ${error.message}`); }

        await writeJson(FILES.cache, cache);
    }

    // contextual.json: merge por row_id. Linhas já existentes ficam intactas (pt editado, skip).
    const byRow = new Map(prevContextual.map(i => [i.row_id, i]));

    for (const r of ambiguous)
    {
        if (!cache.rows[r.id] || byRow.has(r.id)) continue;

        byRow.set(r.id, {
            row_id: r.id,
            movie:  `${r.title} (${r.year})`,
            person: r.person,
            before: r.before,
            pt:     cache.rows[r.id],
            after:  cache.rows[r.id] + translateTail(r.tail),
            skip:   false,
        });
    }

    const contextual = [...byRow.values()].sort((a, b) => a.row_id - b.row_id);
    await writeJson(FILES.contextual, contextual);

    // Só avança o checkpoint no fim: se algo cair antes, a próxima execução relê o intervalo
    // (sem recontar, graças ao countedId, e sem reenviar à IA, graças ao cache).
    await updateState({ collected_id: Math.max(state.collected_id, lastId) });

    console.log(`${Object.keys(translations).length} traduções em ${FILES.translations}, ${contextual.length} linhas em ${FILES.contextual}.`);
    console.log('Revise o que for novo em data/ e marque "skip": true no que estiver errado.');
}