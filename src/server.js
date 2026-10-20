import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { generateSynopsis } from './llm.js';
import { putSynopsis } from './nerdb.js';

if (!config.apiKey) { console.error('Defina NERDB_API_KEY.'); process.exit(1); }

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
};

const json = (res, status, body) =>
{
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
};

async function readBody(req)
{
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return raw ? JSON.parse(raw) : {};
}

async function api(req, res, url)
{
    try
    {
        // Gera a sinopse de um filme (não grava nada).
        if (req.method === 'POST' && url.pathname === '/api/synopsis/generate')
        {
            const { id, title_br, release_year } = await readBody(req);
            const synopsis = await generateSynopsis({ id, title: title_br, year: release_year });

            if (!synopsis) return json(res, 422, { message: 'A IA não soube gerar a sinopse.' });
            return json(res, 200, { id, synopsis });
        }

        // Grava a sinopse (revisada ou não) no NERDB.
        const m = url.pathname.match(/^\/api\/synopsis\/(\d+)$/);

        if (req.method === 'PUT' && m)
        {
            const { synopsis } = await readBody(req);

            if (!synopsis?.trim()) return json(res, 400, { message: 'Sinopse vazia.' });

            await putSynopsis(Number(m[1]), synopsis.trim());
            return json(res, 200, { ok: true });
        }

        json(res, 404, { message: 'Rota não encontrada.' });
    }
    catch (error)
    {
        json(res, error.status ?? 500, { message: error.message });
    }
}

async function serveStatic(res, pathname)
{
    const name = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    const file = join(PUBLIC, normalize(name));

    if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }

    try
    {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
    }
    catch { res.writeHead(404).end('Não encontrado'); }
}

createServer((req, res) =>
{
    const url = new URL(req.url, 'http://localhost');
    return url.pathname.startsWith('/api/') ? api(req, res, url) : serveStatic(res, url.pathname);
})
// Só localhost: o servidor usa a chave de admin do NERDB.
.listen(config.port, '127.0.0.1', () => console.log(`http://127.0.0.1:${config.port}`));