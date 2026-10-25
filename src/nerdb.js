import { config } from './config.js';
import { sleep } from './util.js';

export async function nerdb(path, options = {}, retries = 3)
{
    const res = await fetch(`${config.nerdbUrl}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    });

    if (res.status === 429 && retries > 0)
    {
        await sleep((Number(res.headers.get('Retry-After')) || 60) * 1000);
        return nerdb(path, options, retries - 1);
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok)
    {
        throw Object.assign(new Error(data.message ?? res.statusText), { status: res.status });
    }

    return data;
}

// from: começa depois deste id (checkpoint)
// to:   para ao passar deste id
// max:  para depois de N linhas (útil para testes pequenos)
export async function* allRows({ from = 0, to = Infinity, max = Infinity } = {})
{
    let after = from, seen = 0;

    while (true)
    {
        const page = await nerdb(`/api/admin/movie-cast?after=${after}&limit=100`);

        for (const item of page.items)
        {
            if (item.id > to || seen++ >= max) return;
            yield item;
        }

        if (page.next_after === null) return;
        after = page.next_after;
    }
}

export const patchCharacter = (id, movie_character) =>
    nerdb(`/api/admin/movie-cast/${id}`, { method: 'PATCH', body: JSON.stringify({ movie_character }) });

export const putSynopsis = (id, synopsis) =>
    nerdb(`/api/admin/movie/${id}/synopsis`, { method: 'PUT', body: JSON.stringify({ synopsis, generated: true }) });

// Busca exata por título. Aceita resposta { items: [...] } ou array direto.
export async function searchMovies(title)
{
    const data = await nerdb(`/api/admin/movies/search?q=${encodeURIComponent(title)}&by=title_br&exact=1`);
    return data.items ?? data;
}

export const postMoviePlatform = (movie_id, platform_id, external_id) =>
    nerdb('/api/admin/movie-platforms', { method: 'POST', body: JSON.stringify({ movie_id, platform_id, external_id }) });