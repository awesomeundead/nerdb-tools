import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';

export const FILES = {
    cache:        'llm-cache.json',     // respostas da IA + contagens (retomável)
    translations: 'translations.json',  // revisão por texto único
    contextual:   'contextual.json',    // revisão por linha (casos ambíguos)
    conflicts:    'conflicts.json',     // 409 do apply
    state:        'state.json',         // checkpoints de id (collect/apply incrementais)
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

// collected_id: até onde o collect já leu. applied_id: até onde o apply já varreu.
export const readState = async () => ({ collected_id: 0, applied_id: 0, ...(await readJson(FILES.state, {})) });

export const updateState = async patch => writeJson(FILES.state, { ...(await readState()), ...patch });