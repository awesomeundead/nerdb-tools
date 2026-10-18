import { config } from '../config.js';
import { allRows, patchCharacter } from '../nerdb.js';
import { buildTransform } from '../transform.js';
import { limiter } from '../util.js';
import { readJson, writeJson, readState, updateState, FILES } from '../storage.js';

export async function apply({
    dryRun = false, tail = true, rows = Infinity, limit = Infinity,
    from = null, to = Infinity, full = false,
} = {})
{
    const translations = await readJson(FILES.translations, null);
    const contextual   = await readJson(FILES.contextual, []);

    if (!translations) { console.error('Rode "collect" antes.'); process.exit(1); }

    const state = await readState();
    const start = from ?? (full ? 0 : state.applied_id);
    // Sem --full, nunca passa do que o collect já viu: linhas mais novas ainda não têm tradução.
    const end   = full ? to : Math.min(to, state.collected_id);

    if (!full && start >= end) { console.log('Nada novo: rode "collect" primeiro.'); return; }

    const transform = buildTransform({ translations, contextual, tail });
    const { run, drain } = limiter(config.concurrency);

    const conflicts = [];
    const stats = { planned: 0, ok: 0, failed: 0 };
    let stop = false;
    let lastId = start;
    let failedMin = null;   // menor id que deu erro (não-409): o checkpoint não passa dele

    // Varre só o intervalo (por padrão, o que é novo). Continua idempotente:
    // o que já foi traduzido não casa mais, então reaplicar é seguro.
    for await (const row of allRows({ from: start, to: end, max: rows }))
    {
        if (stop || stats.planned >= limit) break;

        lastId = row.id;

        const after = transform(row);
        if (after === null) continue;

        stats.planned++;

        if (dryRun) { console.log(`#${row.id} ${row.title_br}: ${row.movie_character} -> ${after}`); continue; }

        await run(async () =>
        {
            try { await patchCharacter(row.id, after); stats.ok++; }
            catch (error)
            {
                if (error.status === 409) conflicts.push({ row_id: row.id, movie: row.title_br, before: row.movie_character, after });
                else
                {
                    stats.failed++;
                    failedMin = Math.min(failedMin ?? row.id, row.id);
                    console.error(`#${row.id}: ${error.message}`);
                }

                if (error.status === 401 || error.status === 403) stop = true;   // sem permissão: para tudo
            }
        });

        if (stats.planned % 200 === 0) console.log(`... ${stats.planned} processados`);
    }

    await drain();

    if (conflicts.length)
    {
        const prev  = await readJson(FILES.conflicts, []);
        const known = new Set(prev.map(c => c.row_id));
        await writeJson(FILES.conflicts, [...prev, ...conflicts.filter(c => !known.has(c.row_id))]);
    }

    // Avança o checkpoint só em execução real e completa quanto ao sufixo
    // (com --no-tail os sufixos ficariam para trás). Para antes do primeiro erro.
    if (!dryRun && tail)
    {
        const done = failedMin !== null ? failedMin - 1 : lastId;
        const next = Math.max(state.applied_id, Math.min(done, state.collected_id));
        if (next > state.applied_id) await updateState({ applied_id: next });
    }

    console.log(dryRun
        ? `Dry run: ${stats.planned} alterações previstas, nada foi gravado.`
        : `Aplicados: ${stats.ok} · conflitos: ${conflicts.length} · erros: ${stats.failed}`);
}