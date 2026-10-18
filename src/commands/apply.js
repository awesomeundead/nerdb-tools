import { config } from '../config.js';
import { allRows, patchCharacter } from '../nerdb.js';
import { buildTransform } from '../transform.js';
import { limiter } from '../util.js';
import { readJson, writeJson, FILES } from '../storage.js';

export async function apply({ dryRun = false, tail = true, rows = Infinity, limit = Infinity } = {})
{
    const translations = await readJson(FILES.translations, null);
    const contextual   = await readJson(FILES.contextual, []);

    if (!translations) { console.error('Rode "collect" antes.'); process.exit(1); }

    const transform = buildTransform({ translations, contextual, tail });
    const { run, drain } = limiter(config.concurrency);

    const conflicts = [];
    const stats = { planned: 0, ok: 0, failed: 0 };
    let stop = false;

    // Varre a API de novo: dados sempre atuais e idempotente (o que já foi traduzido não casa mais).
    for await (const row of allRows(rows))
    {
        if (stop || stats.planned >= limit) break;

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
                else { stats.failed++; console.error(`#${row.id}: ${error.message}`); }

                if (error.status === 401 || error.status === 403) stop = true;   // sem permissão: para tudo
            }
        });

        if (stats.planned % 200 === 0) console.log(`... ${stats.planned} processados`);
    }

    await drain();

    if (conflicts.length) await writeJson(FILES.conflicts, conflicts);

    console.log(dryRun
        ? `Dry run: ${stats.planned} alterações previstas, nada foi gravado.`
        : `Aplicados: ${stats.ok} · conflitos: ${conflicts.length} · erros: ${stats.failed}`);
}