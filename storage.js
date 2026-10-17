import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';

export const FILES = {
    cache:        'llm-cache.json',     // respostas da IA (retomável)
    translations: 'translations.json',  // revisão por texto único
    contextual:   'contextual.json',    // revisão por linha (casos ambíguos)
    conflicts:    'conflicts.json',     // 409 do apply
};

const path = name => join(config.dataDir, name);

export async function readJson(name, fallback)
{
    try { return JSON.parse(await readFile(path(name), 'utf8')); }
    catch { return fallback; }
}

// Grava em arquivo temporário e renomeia: não corrompe se o processo cair no meio.
export async function writeJson(name, data)
{
    await mkdir(config.dataDir, { recursive: true });

    const tmp = `${path(name)}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, path(name));
}
