import 'dotenv/config';

export const config = {
    apiKey:      process.env.NERDB_API_KEY,
    nerdbUrl:    process.env.NERDB_URL || 'https://nerdb.com.br',
    
    // Configurações de IA
    llmProvider:  process.env.LLM_PROVIDER || 'local', // 'local' ou 'gemini'
    llamaUrl:     process.env.LLAMA_URL || 'http://127.0.0.1:8080',

    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel:  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    // Níveis de Raciocínio (thinkingLevel)
    geminiThinkingTranslation: process.env.GEMINI_THINKING_TRANSLATION || 'low',
    geminiThinkingSynopsis:    process.env.GEMINI_THINKING_SYNOPSIS    || 'medium',
    geminiDelayMs:             Number(process.env.GEMINI_DELAY_MS || 4500),

    batch:       Number(process.env.BATCH || 20),
    minCount:    Number(process.env.MIN_COUNT || 3),
    concurrency: Number(process.env.CONCURRENCY || 1),
    dataDir:     process.env.DATA_DIR || 'data',
    port:        Number(process.env.PORT || 3000),
};