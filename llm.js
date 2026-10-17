import { config } from './config.js';
import { SYSTEM_TEXTS, SCHEMA_TEXTS, SYSTEM_CONTEXT, SCHEMA_CONTEXT } from './prompts.js';

let jsonMode = 'json_schema';   // cai para json_object se o llama-server recusar

async function chat(system, payload, schema)
{
    const response_format = jsonMode === 'json_schema'
        ? { type: 'json_schema', json_schema: { name: 'out', schema } }
        : { type: 'json_object', schema };

    const res = await fetch(`${config.llamaUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            temperature: 0,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            response_format,
        }),
    });

    if (res.status === 400 && jsonMode === 'json_schema')
    {
        jsonMode = 'json_object';
        return chat(system, payload, schema);
    }

    if (!res.ok) throw new Error(`llama-server ${res.status}`);

    const content = (await res.json()).choices[0].message.content;
    return JSON.parse(content).items;
}

// texts: string[] -> [{ id (índice em texts), pt, ambiguous }]
export const translateTexts = texts =>
    chat(SYSTEM_TEXTS, texts.map((text, id) => ({ id, text })), SCHEMA_TEXTS);

// items: [{ id (row id), character, movie, year, person }] -> [{ id, pt }]
export const translateContextual = items =>
    chat(SYSTEM_CONTEXT, items, SCHEMA_CONTEXT);
