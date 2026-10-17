import { config } from './config.js';

const [command, ...args] = process.argv.slice(2);
const flags = new Set(args);
const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || Infinity;

if (!['collect', 'apply'].includes(command))
{
    console.log('Uso:\n  node src/cli.js collect\n  node src/cli.js apply [--dry-run] [--limit=N] [--no-tail]');
    process.exit(command ? 1 : 0);
}

if (!config.apiKey) { console.error('Defina NERDB_API_KEY.'); process.exit(1); }

if (command === 'collect')
{
    const { collect } = await import('./commands/collect.js');
    await collect();
}
else
{
    const { apply } = await import('./commands/apply.js');
    await apply({ dryRun: flags.has('--dry-run'), tail: !flags.has('--no-tail'), limit });
}
