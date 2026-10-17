# Como usar

- 1. Suba o llama-server com um modelo instruct 7–8B, por exemplo llama-server -m qwen2.5-7b-instruct-q4_k_m.gguf --port 8080.
- 2. Crie uma chave de API na página de configurações, com um usuário admin.
- 3. Rode node translate-cast.js collect e abra o cast-review.json. Marque "skip": true no que estiver errado.
- 4. Rode apply --dry-run para conferir e depois apply para gravar.

# Pontos de atenção

- Deduplicação: a IA traduz cada texto único uma vez, não uma vez por linha. Isso corta o custo, mas o título do filme não entra no contexto. Para um papel como “Doctor” isso não importa. Se você notar traduções erradas, mande o title_br junto no prompt só para os textos ambíguos.
- Gênero: o prompt manda manter o original quando o gênero é ambíguo. Confira no arquivo de revisão o que a IA marcou como llm, que é onde estão os erros mais prováveis.
- Conflitos (409): acontecem quando o ator já tem o personagem traduzido no mesmo filme. O script só marca a linha. Decida depois se apaga a duplicata pelo editor de elenco.
- Rascunho: o response_format com json_schema funciona em versões recentes do llama-server. Se a sua recusar, troque por { type: 'json_object', schema: SCHEMA }.