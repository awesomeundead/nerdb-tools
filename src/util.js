export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Executa no máximo `max` tarefas ao mesmo tempo. As tarefas devem tratar os próprios erros.
export function limiter(max)
{
    const active = new Set();

    async function run(task)
    {
        while (active.size >= max) await Promise.race(active);

        const p = task().finally(() => active.delete(p));
        active.add(p);
    }

    const drain = () => Promise.all(active);

    return { run, drain };
}
