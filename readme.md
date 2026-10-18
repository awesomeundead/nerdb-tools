# nerdb-tools

Tradução dos papéis genéricos do elenco (`movie_character`) do NERDB para português, usando um llama-server local.

## Como usar

1. Copie `.env.example` para `.env` e preencha `NERDB_API_KEY` (chave criada na página de configurações, com usuário admin).
2. Suba o llama-server com um modelo instruct 7–8B: `llama-server -m qwen2.5-7b-instruct-q4_k_m.gguf --port 8080`.
3. `npm run collect` gera, em `data/`:
   - `translations.json`: uma entrada por texto único, ordenada por frequência. Marque `"skip": true` no que estiver errado.
   - `contextual.json`: linhas ambíguas (gênero/contexto) que a IA decidiu com filme, ano e nome do ator. Marque `"skip": true` por linha.
4. `npm run apply:dry` para conferir e `npm run apply` para gravar.

### Teste pequeno (ex.: 500 registros)

Use a mesma `--rows` no `collect` e no `apply`, e um `DATA_DIR` separado para não misturar com a execução real:

```
DATA_DIR=data-test MIN_COUNT=1 npm run collect -- --rows=500
DATA_DIR=data-test npm run apply:dry -- --rows=500
DATA_DIR=data-test npm run apply -- --rows=500
```

```powershell
$env:DATA_DIR="data-test"; $env:MIN_COUNT="1"; npm run collect -- --rows=500
```

- `--rows=N` lê só as N primeiras linhas da API (sempre as mesmas, em ordem de id).
- `--limit=N` (só no `apply`) grava no máximo N alterações.
- `MIN_COUNT=1` no teste, porque em 500 linhas poucos textos se repetem 3 vezes.

## Estrutura

```
src/
  cli.js              entrada: collect | apply
  config.js           variáveis de ambiente
  nerdb.js            cliente da API (retry em 429, paginação, PATCH)
  llm.js              cliente do llama-server (fallback json_schema -> json_object)
  prompts.js          prompts e schemas
  dict.js             papéis inequívocos, sem IA
  tail.js             padronização de (voice), (uncredited) etc.
  normalize.js        split base/sufixo e filtro de candidatos
  transform.js        regra única que decide o novo valor de uma linha
  storage.js          leitura/gravação atômica dos JSONs em data/
  util.js             sleep e limitador de concorrência
  commands/
    collect.js        varre, traduz e gera os arquivos de revisão
    apply.js          varre de novo e grava os PATCHs
```

## Como funciona

- **Texto único primeiro:** `collect` conta os textos e só envia à IA os que aparecem ao menos `MIN_COUNT` vezes, dos mais frequentes para os menos. Nomes próprios, que quase nunca se repetem, ficam de fora.
- **Ambíguos com contexto:** a IA marca `ambiguous` quando a tradução depende de gênero ou filme (Nurse, Student...). Esses textos são refeitos linha a linha com título, ano e nome do ator, e a IA decide.
- **Sufixos:** `(voice)`, `(uncredited)` etc. viram `(voz)`, `(sem créditos)` em qualquer linha, mesmo que o nome não mude. Para incluir termos novos, edite `src/tail.js`. Use `--no-tail` para pular.
- **Idempotente:** `apply` não depende de flags `done`. Rodar de novo só pega o que ainda não foi alterado.
- **Conflitos (409):** vão para `data/conflicts.json`. Decida depois se apaga a duplicata pelo editor de elenco.
- **Retomável:** `data/llm-cache.json` guarda as respostas da IA. Pode interromper e rodar `collect` de novo. Reexecutar preserva os `skip` já marcados.