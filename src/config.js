import 'dotenv/config';

export const config = {
    apiKey:      process.env.NERDB_API_KEY,
    nerdbUrl:    process.env.NERDB_URL || 'https://nerdb.com.br',
    llamaUrl:    process.env.LLAMA_URL || 'http://127.0.0.1:8080',
    batch:       Number(process.env.BATCH || 20),
    minCount:    Number(process.env.MIN_COUNT || 3),
    concurrency: Number(process.env.CONCURRENCY || 1),
    dataDir:     process.env.DATA_DIR || 'data',
    port:        Number(process.env.PORT || 3000),
};
