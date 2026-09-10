import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Accept common dev-server flags as well as Next.js flags, including supervised previews.
const args = process.argv.slice(2).filter(arg => arg !== '--strictPort').map(arg => arg === '--host' ? '--hostname' : arg);
if (!args.includes('--hostname') && !args.includes('-H')) args.push('--hostname','127.0.0.1');
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', ...args], { stdio:'inherit', env:process.env });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode=1; });
child.on('exit', code => { process.exitCode=code ?? 1; });
