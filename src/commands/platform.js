import { config } from '../config.js';
import { searchMovies, postMoviePlatform } from '../nerdb.js';
import { readJson, writeJson } from '../storage.js';
import { progress } from '../util.js';

const F = {
    input:     'prime.json',                // { items: [{ movie, url }] }
    matches:   'platform-matches.json',     // título com 1 candidato
    ambiguous: 'platform-ambiguous.json',   // 2+ candidatos: preencha movie_id
    missing:   'platform-not-found.json',
    conflicts: 'platform-conflicts.json',
};

const label = m => `${m.title_br ?? m.title} (${m.release_year ?? '?'})`;

export async function match()
{
    const input = await readJson(F.input, null);
    if (!input?.items) { console.error(`Coloque o JSON em ${config.dataDir}/${F.input}`); process.exit(1); }

    // Retomável: o que já foi decidido (e suas edições manuais) é preservado.
    const matches   = await readJson(F.matches, []);
    const ambiguous = await readJson(F.ambiguous, []);
    const done      = new Set([...matches, ...ambiguous].map(i => i.external_id));
    const missing   = [];

    const todo = input.items.filter(i => !done.has(i.url));
    const bar  = progress('Buscando no NERDB', todo.length);

    for (const [n, item] of todo.entries())
    {
        bar.update(n, item.movie);
        const found = await searchMovies(item.movie);

        if (found.length === 1)
            matches.push({ external_id: item.url, movie: item.movie, movie_id: found[0].id, nerdb: label(found[0]), skip: false });
        else if (found.length > 1)
            ambiguous.push({
                external_id: item.url, movie: item.movie, movie_id: null, skip: false,
                candidates: found.map(m => ({ id: m.id, title: label(m) })),
            });
        else
            missing.push({ external_id: item.url, movie: item.movie });

        if (n % 100 === 99)
        {
            await writeJson(F.matches, matches);
            await writeJson(F.ambiguous, ambiguous);
        }
    }

    bar.done();

    await writeJson(F.matches, matches);
    await writeJson(F.ambiguous, ambiguous);
    await writeJson(F.missing, missing);

    console.log(`${matches.length} casados · ${ambiguous.length} ambíguos · ${missing.length} não encontrados.`);
    console.log('Revise platform-matches.json (confira o ano em "nerdb") e preencha "movie_id" em platform-ambiguous.json.');
}

export async function applyPlatform({ dryRun = false } = {})
{
    const matches   = await readJson(F.matches, []);
    const ambiguous = await readJson(F.ambiguous, []);

    const jobs = [...matches, ...ambiguous].filter(i => i.movie_id && !i.skip);

    // Mesmo filme apontado por dois ids da plataforma: provável erro de casamento.
    const byMovie = Map.groupBy(jobs, j => j.movie_id);
    const dupes   = [...byMovie.values()].filter(g => g.length > 1);
    if (dupes.length) console.warn(`Atenção: ${dupes.length} filmes do NERDB receberam mais de um id (confira).`);

    const conflicts = [];
    const stats = { ok: 0, failed: 0 };

    for (const job of jobs)
    {
        if (dryRun) { console.log(`${job.movie} -> #${job.movie_id} (${job.external_id})`); continue; }

        try { await postMoviePlatform(job.movie_id, config.platformId, job.external_id); stats.ok++; }
        catch (error)
        {
            if (error.status === 409) conflicts.push({ ...job });
            else { stats.failed++; console.error(`${job.movie}: ${error.message}`); }

            if (error.status === 401 || error.status === 403) break;
        }
    }

    if (conflicts.length) await writeJson(F.conflicts, conflicts);

    console.log(dryRun
        ? `Dry run: ${jobs.length} gravações previstas.`
        : `Gravados: ${stats.ok} · já existiam/conflitos: ${conflicts.length} · erros: ${stats.failed}`);
}