import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDevEnvironment } from './dev-ports.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '..');
const websiteDirectory = path.join(repositoryRoot, 'apps', 'website');
const environment = getDevEnvironment();
const iconBuild = spawnSync('node', [path.join(currentDirectory, 'build-macos-app-icon.mjs')], {
    cwd: repositoryRoot,
    stdio: 'inherit',
});

if (iconBuild.status !== 0) {
    process.exit(iconBuild.status ?? 1);
}

const child = spawn('bun', ['x', 'electron', 'electron/main.cjs', ...process.argv.slice(2)], {
    cwd: websiteDirectory,
    env: {
        ...environment,
        HAUS_ELECTRON_DEV_URL: `http://localhost:${environment.HAUS_WEBSITE_PORT}`,
    },
    stdio: 'inherit',
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});

child.on('error', (error) => {
    console.error(error);
    process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
}
