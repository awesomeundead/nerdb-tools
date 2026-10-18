import { split, isCandidate } from './normalize.js';
import { translateTail } from './tail.js';

// Decide o novo valor de movie_character de uma linha (ou null se nada muda).
// Ordem: revisão contextual da linha > tradução por texto único > só padronizar o sufixo.
export function buildTransform({ translations, contextual, tail = true })
{
    const byRow = new Map(contextual.map(i => [i.row_id, i]));

    return function transform(row)
    {
        const current = row.movie_character;
        const { base, tail: rawTail } = split(current);

        let newBase = base;
        const item = byRow.get(row.id);

        if (item)
        {
            if (item.skip) return null;
            newBase = item.pt;
        }
        else if (isCandidate(base))
        {
            const t = translations[base.toLowerCase()];
            if (t && !t.skip) newBase = t.pt;
        }

        const newTail = tail ? translateTail(rawTail) : rawTail;

        if (newBase === base && newTail === rawTail) return null;   // evita PATCH inútil

        return newBase + newTail;
    };
}
