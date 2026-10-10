import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../apps/hosted-mcp/', import.meta.url));
const args = process.argv.slice(2);
const command = args.shift();
const commands = {
    setup: ['sync', '--frozen'],
    test: ['run', '--frozen', 'python', 'check.py'],
    smoke: ['run', '--frozen', 'python', 'live-smoke.py', ...args],
    login: ['run', '--frozen', 'python', '-m', 'hosted.cli', 'login', ...args],
    revoke: ['run', '--frozen', 'python', '-m', 'hosted.cli', 'revoke', ...args],
    serve: ['run', '--frozen', 'python', '-m', 'hosted.cli', 'serve', ...args],
    browser: ['run', '--frozen', 'playwright', 'install', 'chromium'],
};
if (!Object.hasOwn(commands, command)) {
    throw new Error(
        'Usage: bun run hosted-mcp <setup|test|smoke|login|revoke|serve|browser> [arguments]'
    );
}
const child = spawn('uv', commands[command], { cwd: directory, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
}
child.once('error', (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
});
child.once('exit', (code) => {
    process.exitCode = code ?? 1;
});
