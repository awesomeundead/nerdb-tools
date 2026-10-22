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

const fmt = s =>
{
    s = Math.round(s);
    const m = Math.floor(s / 60);
    return m ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};

// total = null: sem porcentagem, só contagem. Em terminal sem TTY (log em arquivo), imprime a cada 10%.
export function progress(label, total = null)
{
    const start = Date.now();
    const tty = process.stdout.isTTY;
    let done = 0, extra = '', lastDecile = -1;

    const line = () =>
    {
        const secs = (Date.now() - start) / 1000;
        let s = `${label}: `;

        if (total)
        {
            const pct = Math.min(done / total, 1), w = 24, filled = Math.round(pct * w);
            s += `[${'#'.repeat(filled)}${'.'.repeat(w - filled)}] ${Math.round(pct * 100)}% (${done}/${total})`;
            if (done > 0 && done < total) s += ` · faltam ~${fmt(secs / done * (total - done))}`;
        }
        else s += `${done} lidas`;

        return `${s} · ${fmt(secs)}${extra ? ` · ${extra}` : ''}`;
    };

    const clear = () => { if (tty) process.stdout.write('\r\x1b[K'); };
    const draw  = () => { if (tty) process.stdout.write(`\r\x1b[K${line()}`); };

    const timer = tty ? setInterval(draw, 500) : null;
    timer?.unref();

    return {
        update(n, e)
        {
            done = n;
            if (e !== undefined) extra = e;

            if (!tty && total)
            {
                const d = Math.floor(done / total * 10);
                if (d > lastDecile) { lastDecile = d; console.log(line()); }
            }
        },
        // Para mensagens no meio da barra (warn/error) sem bagunçar a linha.
        log(msg) { clear(); console.log(msg); draw(); },
        done() { clearInterval(timer); clear(); console.log(line()); },
    };
}