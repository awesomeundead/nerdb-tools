import { config } from './config.js';

const [command, ...args] = process.argv.slice(2);
const flags = new Set(args);
const flagNum = name => Number(args.find(a => a.startsWith(`--${name}=`))?.split('=')[1]) || Infinity;
const rows  = flagNum('rows');    // só lê as N primeiras linhas da API
const limit = flagNum('limit');   // no máximo N alterações no apply

if (!['collect', 'apply'].includes(command))
{
    console.log('Uso:\n  node src/cli.js collect [--rows=N]\n  node src/cli.js apply [--dry-run] [--rows=N] [--limit=N] [--no-tail]');
    process.exit(command ? 1 : 0);
}

if (!config.apiKey) { console.error('Defina NERDB_API_KEY.'); process.exit(1); }

if (command === 'collect')
{
    const { collect } = await import('./commands/collect.js');
    await collect({ rows });
}
else
{
    const { apply } = await import('./commands/apply.js');
    await apply({ dryRun: flags.has('--dry-run'), tail: !flags.has('--no-tail'), rows, limit });
}