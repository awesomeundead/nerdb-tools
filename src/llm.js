import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import { SYSTEM_TEXTS, SCHEMA_TEXTS, SYSTEM_CONTEXT, SCHEMA_CONTEXT, SYSTEM_SYNOPSIS, SCHEMA_SYNOPSIS } from './prompts.js';

let jsonMode = 'json_schema';

const ai = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null;

async function chatLocal(system, payload, schema) {
    const response_format = jsonMode === 'json_schema'
        ? { type: 'json_schema', json_schema: { name: 'out', schema } }
        : { type: 'json_object', schema };

    const res = await fetch(`${config.llamaUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
            temperature: 0,
            max_tokens: 2048,
            chat_template_kwargs: { enable_thinking: false },
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            response_format,
        }),
    });

    if (res.status === 400 && jsonMode === 'json_schema') {
        jsonMode = 'json_object';
        return chatLocal(system, payload, schema);
    }

    if (!res.ok) throw new Error(`llama-server ${res.status}`);

    const content = (await res.json()).choices[0].message.content;
    return JSON.parse(content).items;
}

async function chatGemini(system, payload, schema, thinkingLevel) {
    if (!ai) throw new Error('GEMINI_API_KEY não definida no ambiente.');

    const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: JSON.stringify(payload),
        config: {
            systemInstruction: system,
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: schema,
            thinkingConfig: {
                thinkingLevel: thinkingLevel || 'low',
            },
        },
    });

    const text = response.text;
    if (!text) throw new Error('A API do Gemini retornou uma resposta vazia.');

    return JSON.parse(text).items;
}

// Função unificada de chat
async function chat(system, payload, schema, thinkingLevel) {
    if (config.llmProvider === 'gemini') {
        return chatGemini(system, payload, schema, thinkingLevel);
    }
    return chatLocal(system, payload, schema);
}

// movie: { id, title, year } -> string (vazia se a IA não souber)
export async function generateSynopsis(movie) {
    // Passa o nível de raciocínio específico para sinopses
    const items = await chat(SYSTEM_SYNOPSIS, [movie], SCHEMA_SYNOPSIS, config.geminiThinkingSynopsis);
    return (items?.[0]?.synopsis ?? '').trim();
}

// texts: string[] -> [{ id (índice em texts), pt, ambiguous }]
export const translateTexts = texts =>
    chat(SYSTEM_TEXTS, texts.map((text, id) => ({ id, text })), SCHEMA_TEXTS, config.geminiThinkingTranslation);

// items: [{ id (row id), character, movie, year, person }] -> [{ id, pt }]
export const translateContextual = items =>
    chat(SYSTEM_CONTEXT, items, SCHEMA_CONTEXT, config.geminiThinkingTranslation);