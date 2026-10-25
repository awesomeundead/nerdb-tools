import { config } from './config.js';

const [command, ...args] = process.argv.slice(2);
const flags = new Set(args);

const flagNum = (name, fallback) =>
{
    const raw = args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
    const n = Number(raw);
    return raw !== undefined && Number.isFinite(n) ? n : fallback;
};

const rows  = flagNum('rows', Infinity);    // só lê as N primeiras linhas do intervalo
const limit = flagNum('limit', Infinity);   // no máximo N alterações no apply
const from  = flagNum('from', null);        // começa depois deste id (padrão: checkpoint)
const to    = flagNum('to', Infinity);      // para neste id
const full  = flags.has('--full');          // ignora checkpoints e varre tudo

if (!['collect', 'apply', 'platform', 'platform:apply'].includes(command))
{
    console.log(`Uso:
  node src/cli.js collect [--full] [--from=ID] [--to=ID] [--rows=N]
  node src/cli.js apply [--dry-run] [--full] [--from=ID] [--to=ID] [--rows=N] [--limit=N] [--no-tail]

Por padrão só processa o que é novo (depois do checkpoint em data/state.json).
--full ignora os checkpoints e varre tudo.`);
    process.exit(command ? 1 : 0);
}

if (!config.apiKey) { console.error('Defina NERDB_API_KEY.'); process.exit(1); }

if (command === 'collect')
{
    const { collect } = await import('./commands/collect.js');
    await collect({ rows, from, to, full });
}
else if (command === 'platform')
{
    const { match } = await import('./commands/platform.js');
    await match();
}
else if (command === 'platform:apply')
{
    const { applyPlatform } = await import('./commands/platform.js');
    await applyPlatform({ dryRun: flags.has('--dry-run') });
}
else
{
    const { apply } = await import('./commands/apply.js');
    await apply({ dryRun: flags.has('--dry-run'), tail: !flags.has('--no-tail'), rows, limit, from, to, full });
}