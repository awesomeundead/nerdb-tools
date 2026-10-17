// Uso:
// node translate-cast.js collect           -> gera cast-review.json
// node translate-cast.js apply [--dry-run] -> aplica o que não tem "skip": true
import "dotenv/config";
import { readFile, writeFile } from 'node:fs/promises';

const NERDB_API_KEY = process.env.NERDB_API_KEY;
const NERDB_URL = process.env.NERDB_URL || 'https://nerdb.com.br';
const LLAMA_URL = process.env.LLAMA_URL || 'http://127.0.0.1:8080';

const REVIEW_FILE = 'cast-review.json';
const CACHE_FILE  = 'llm-cache.json';
const BATCH       = 20;

const [command, ...flags] = process.argv.slice(2);

if (!NERDB_API_KEY) { console.error('Defina NERDB_API_KEY.'); process.exit(1); }

// Papéis inequívocos: resolvidos sem IA. Chave em minúsculas.
const DICT = {
    'father': 'Pai', 'mother': 'Mãe', 'man': 'Homem', 'woman': 'Mulher',
    'boy': 'Menino', 'girl': 'Menina', 'son': 'Filho', 'daughter': 'Filha',
    'brother': 'Irmão', 'sister': 'Irmã', 'husband': 'Marido', 'wife': 'Esposa',
    'waiter': 'Garçom', 'waitress': 'Garçonete', 'policeman': 'Policial',
    'police officer': 'Policial', 'doctor': 'Médico', 'teacher': 'Professor',
    'bartender': 'Barman', 'taxi driver': 'Taxista', 'old man': 'Velho',
    'old woman': 'Velha', 'young man': 'Jovem', 'young woman': 'Jovem',
    'soldier': 'Soldado', 'priest': 'Padre', 'reporter': 'Repórter',
};

// ── NERDB ────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function nerdb(path, options = {}, retry = true)
{
    const res = await fetch(`${NERDB_URL}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${NERDB_API_KEY}`, 'Content-Type': 'application/json' },
    });

    if (res.status === 429 && retry)
    {
        await sleep((Number(res.headers.get('Retry-After')) || 60) * 1000);
        return nerdb(path, options, false);
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok)
    {
        throw Object.assign(new Error(data.message ?? res.statusText), { status: res.status });
    }

    return data;
}

async function* allRows()
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

// ── Normalização ─────────────────────────────────────────────

// "Policeman #2 (uncredited)" -> base "Policeman", tail " #2 (uncredited)"
function split(character)
{
    const m = character.match(/^(.*?)(\s+#?\d+)?(\s*\(.*\))?$/);
    return { base: m[1].trim(), tail: (m[2] ?? '') + (m[3] ?? '') };
}

// Só texto ASCII, curto e não vazio: o que já está em português ou tem acento fica de fora.
const isCandidate = base => base !== '' && /^[\x20-\x7E]+$/.test(base) && base.split(/\s+/).length <= 4;

// ── llama.cpp ────────────────────────────────────────────────

const SYSTEM = `Você traduz papéis genéricos de elenco de filmes do inglês para português do Brasil.
Regras:
- Traduza apenas papéis ou descrições genéricas (ex.: "Police Officer", "Old Fisherman", "Young Neo" -> só se fizer sentido).
- Nomes próprios, apelidos, siglas e nomes de criaturas ou personagens específicos devem voltar IGUAIS ao original.
- Se o gênero for ambíguo (ex.: "Nurse", "Student"), devolva o original.
- Responda só o JSON pedido, um item para cada texto recebido.`;

const SCHEMA = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: { original: { type: 'string' }, pt: { type: 'string' } },
                required: ['original', 'pt'],
            },
        },
    },
    required: ['items'],
};

async function translateBatch(texts)
{
    const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            temperature: 0,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: JSON.stringify(texts) },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'cast', schema: SCHEMA } },
        }),
    });

    if (!res.ok) throw new Error(`llama-server ${res.status}`);

    const content = (await res.json()).choices[0].message.content;
    return JSON.parse(content).items;
}

async function readJson(file, fallback)
{
    try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

// ── collect ──────────────────────────────────────────────────

async function collect()
{
    const cache   = await readJson(CACHE_FILE, {});   // base (minúscula) -> tradução ou null
    const rows    = [];
    const pending = new Set();

    for await (const row of allRows())
    {
        const { base, tail } = split(row.movie_character);

        if (!isCandidate(base)) continue;

        rows.push({ row, base, tail });

        const key = base.toLowerCase();
        if (!(key in DICT) && !(key in cache)) pending.add(base);
    }

    console.log(`${rows.length} candidatos, ${pending.size} textos únicos para a IA.`);

    const list = [...pending];

    for (let i = 0; i < list.length; i += BATCH)
    {
        const batch = list.slice(i, i + BATCH);

        try
        {
            for (const { original, pt } of await translateBatch(batch))
            {
                const same = pt.trim() === '' || pt.trim().toLowerCase() === original.toLowerCase();
                cache[original.toLowerCase()] = same ? null : pt.trim();
            }
        }
        catch (error)
        {
            console.error(`Lote ${i / BATCH + 1} falhou: ${error.message}`);
        }

        await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));   // retomável
    }

    const review = [];

    for (const { row, base, tail } of rows)
    {
        const key   = base.toLowerCase();
        const after = key in DICT ? DICT[key] : cache[key];

        if (!after) continue;

        review.push({
            row_id: row.id,
            movie: `${row.title_br} (${row.release_year})`,
            person: row.person_name,
            before: row.movie_character,
            after: after + tail,
            source: key in DICT ? 'dict' : 'llm',
        });
    }

    await writeFile(REVIEW_FILE, JSON.stringify(review, null, 2));
    console.log(`${review.length} alterações em ${REVIEW_FILE}. Revise e marque "skip": true no que não quiser.`);
}

// ── apply ────────────────────────────────────────────────────

async function apply()
{
    const dryRun = flags.includes('--dry-run');
    const review = await readJson(REVIEW_FILE, null);

    if (!review) { console.error(`${REVIEW_FILE} não encontrado. Rode "collect" antes.`); process.exit(1); }

    let ok = 0, conflict = 0, failed = 0;

    for (const item of review)
    {
        if (item.skip || item.done) continue;

        if (dryRun)
        {
            console.log(`#${item.row_id} ${item.movie}: ${item.before} -> ${item.after}`);
            continue;
        }

        try
        {
            await nerdb(`/api/admin/movie-cast/${item.row_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ movie_character: item.after }),
            });
            item.done = true;
            ok++;
        }
        catch (error)
        {
            if (error.status === 409) { item.conflict = true; conflict++; }
            else { item.error = error.message; failed++; }

            if (error.status === 401 || error.status === 403) break;   // chave sem permissão: para tudo
        }
    }

    if (!dryRun) await writeFile(REVIEW_FILE, JSON.stringify(review, null, 2));   // marca o que já foi
    console.log(dryRun ? 'Dry run: nada foi gravado.' : `Aplicados: ${ok} · conflitos: ${conflict} · erros: ${failed}`);
}

if (command === 'collect') await collect();
else if (command === 'apply') await apply();
else console.log('Uso: node translate-cast.js collect | apply [--dry-run]');