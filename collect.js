import { config } from '../config.js';
import { allRows } from '../nerdb.js';
import { DICT } from '../dict.js';
import { split, isCandidate } from '../normalize.js';
import { translateTail } from '../tail.js';
import { translateTexts, translateContextual } from '../llm.js';
import { readJson, writeJson, FILES } from '../storage.js';

const clean = (pt, original) =>
{
    const v = (pt ?? '').trim();
    return v === '' || v.toLowerCase() === original.toLowerCase() ? null : v;
};

export async function collect()
{
    const cache = await readJson(FILES.cache, {});
    cache.texts ??= {};   // chave minúscula -> { pt|null, ambiguous }
    cache.rows  ??= {};   // row id -> pt|null (casos ambíguos, traduzidos com contexto)

    const prevTranslations = await readJson(FILES.translations, {});
    const prevContextual   = await readJson(FILES.contextual, []);
    const skippedRows      = new Set(prevContextual.filter(i => i.skip).map(i => i.row_id));

    // 1. Varre a API: conta textos únicos e guarda o contexto de cada candidato.
    const counts  = new Map();   // key -> { text, count }
    const records = [];

    for await (const row of allRows())
    {
        const { base, tail } = split(row.movie_character);
        if (!isCandidate(base)) continue;

        const key = base.toLowerCase();
        const entry = counts.get(key) ?? { text: base, count: 0 };
        entry.count++;
        counts.set(key, entry);

        records.push({
            id: row.id, key, tail, before: row.movie_character,
            title: row.title_br, year: row.release_year, person: row.person_name,
        });
    }

    // 2. IA por texto único, dos mais frequentes para os menos (nomes próprios ficam de fora).
    const pending = [...counts]
        .filter(([key, e]) => !(key in DICT) && !(key in cache.texts) && e.count >= config.minCount)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([key, e]) => ({ key, text: e.text }));

    console.log(`${counts.size} textos únicos, ${pending.length} vão para a IA (mínimo ${config.minCount} ocorrências).`);

    for (let i = 0; i < pending.length; i += config.batch)
    {
        const batch = pending.slice(i, i + config.batch);

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
        catch (error) { console.error(`Lote ${i / config.batch + 1} falhou: ${error.message}`); }

        await writeJson(FILES.cache, cache);
    }

    // 3. translations.json: uma entrada por texto único, ordenada por frequência.
    const translations = {};

    for (const [key, e] of [...counts].sort((a, b) => b[1].count - a[1].count))
    {
        const inDict = key in DICT;
        const c      = cache.texts[key];
        const pt     = inDict ? DICT[key] : (c && !c.ambiguous ? c.pt : null);

        if (!pt) continue;

        translations[key] = {
            count: e.count, pt, source: inDict ? 'dict' : 'llm',
            skip: prevTranslations[key]?.skip ?? false,
        };
    }

    await writeJson(FILES.translations, translations);

    // 4. Ambíguos (gênero/contexto): a IA decide linha a linha, com filme, ano e nome do ator.
    const ambiguous = records.filter(r => !(r.key in DICT) && cache.texts[r.key]?.ambiguous);
    const todo      = ambiguous.filter(r => !(r.id in cache.rows));

    console.log(`${ambiguous.length} linhas ambíguas, ${todo.length} a traduzir com contexto.`);

    for (let i = 0; i < todo.length; i += config.batch)
    {
        const batch = todo.slice(i, i + config.batch);

        try
        {
            const input = batch.map(r => ({
                id: r.id, character: counts.get(r.key).text, movie: r.title, year: r.year, person: r.person,
            }));

            for (const r of await translateContextual(input))
            {
                const rec = batch.find(b => b.id === Number(r.id));
                if (rec) cache.rows[rec.id] = clean(r.pt, counts.get(rec.key).text);
            }
        }
        catch (error) { console.error(`Lote contextual ${i / config.batch + 1} falhou: ${error.message}`); }

        await writeJson(FILES.cache, cache);
    }

    const contextual = ambiguous
        .filter(r => cache.rows[r.id])
        .map(r => ({
            row_id: r.id,
            movie:  `${r.title} (${r.year})`,
            person: r.person,
            before: r.before,
            pt:     cache.rows[r.id],
            after:  cache.rows[r.id] + translateTail(r.tail),
            skip:   skippedRows.has(r.id),
        }));

    await writeJson(FILES.contextual, contextual);

    console.log(`${Object.keys(translations).length} traduções em ${FILES.translations}, ${contextual.length} linhas em ${FILES.contextual}.`);
    console.log('Revise os dois arquivos em data/ e marque "skip": true no que estiver errado.');
}
