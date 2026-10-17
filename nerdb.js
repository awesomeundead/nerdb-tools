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

export async function* allRows()
{
    let after = 0;

    while (true)
    {
        const page = await nerdb(`/api/admin/movie-cast?after=${after}&limit=100`);
        yield* page.items;

        if (page.next_after === null) return;
        after = page.next_after;
    }
}

export const patchCharacter = (id, movie_character) =>
    nerdb(`/api/admin/movie-cast/${id}`, { method: 'PATCH', body: JSON.stringify({ movie_character }) });
