export const SYSTEM_TEXTS = `Você traduz papéis genéricos de elenco de filmes do inglês para português do Brasil.
Regras:
- Traduza apenas papéis ou descrições genéricas (ex.: "Police Officer", "Old Fisherman").
- Nomes próprios, apelidos, siglas e nomes de criaturas ou personagens específicos devem voltar IGUAIS ao original, com ambiguous = false.
- Se a tradução depender do gênero da pessoa ou do contexto do filme (ex.: "Nurse", "Student", "Doctor"), marque ambiguous = true. Nesse caso "pt" pode ser a forma masculina: ela será refeita com contexto.
- Responda só o JSON pedido, um item para cada texto recebido, mantendo o mesmo id.`;

export const SCHEMA_TEXTS = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: { id: { type: 'integer' }, pt: { type: 'string' }, ambiguous: { type: 'boolean' } },
                required: ['id', 'pt', 'ambiguous'],
            },
        },
    },
    required: ['items'],
};

export const SYSTEM_CONTEXT = `Você traduz papéis de elenco de filmes do inglês para português do Brasil, usando o contexto de cada item (filme, ano e nome do ator ou atriz).
Regras:
- Decida o gênero pelo nome da pessoa e pelo contexto do filme. Se mesmo assim não der para decidir, use a forma que o português adota como padrão.
- Se o texto for um nome próprio ou não for um papel genérico, devolva igual ao original.
- Responda só o JSON pedido, um item para cada entrada, mantendo o mesmo id.`;

export const SCHEMA_CONTEXT = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: { id: { type: 'integer' }, pt: { type: 'string' } },
                required: ['id', 'pt'],
            },
        },
    },
    required: ['items'],
};

export const SYSTEM_SYNOPSIS = `Você escreve sinopses curtas de filmes em português do Brasil, a partir do título e do ano.
Regras:
- Escreva 2 ou 3 frases, com no máximo 500 caracteres e sem spoilers.
- Não invente enredo: se você não conhecer o filme com segurança, devolva "synopsis" vazio.
- Responda só o JSON pedido, um item para cada entrada, mantendo o mesmo id.`;

export const SCHEMA_SYNOPSIS = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: { id: { type: 'integer' }, synopsis: { type: 'string' } },
                required: ['id', 'synopsis'],
            },
        },
    },
    required: ['items'],
};