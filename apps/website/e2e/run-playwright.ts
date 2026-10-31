import net from 'node:net';
import { fileURLToPath } from 'node:url';

function getFreePort() {
    return new Promise<number>((resolve, reject) => {
        const server = net.createServer();

        server.listen(0, '127.0.0.1', () => {
            const address = server.address();

            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Failed to acquire a free port for Playwright e2e.'));
                return;
            }

            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(address.port);
            });
        });

        server.on('error', reject);
    });
}

const websiteRoot = fileURLToPath(new URL('../', import.meta.url));
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const [hausServerPort, websitePort] = await Promise.all([getFreePort(), getFreePort()]);
const command = [process.execPath, '--bun', 'x', 'playwright', 'test', ...process.argv.slice(2)];
const env = {
    ...process.env,
    HAUS_E2E_RUN_ID: runId,
    HAUS_SERVER_PORT: `${hausServerPort}`,
    HAUS_WEBSITE_PORT: `${websitePort}`,
    NODE_ENV: 'test',
};

await runPreflight(env);

const child = Bun.spawn(command, {
    cwd: websiteRoot,
    env,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit',
});

let forwardedSignal: NodeJS.Signals | null = null;
const forwardSignal = (signal: NodeJS.Signals) => {
    if (forwardedSignal) {
        return;
    }
    forwardedSignal = signal;
    child.kill(signal);
};

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

const exitCode = await child.exited;
process.exit(forwardedSignal === 'SIGINT' ? 130 : forwardedSignal === 'SIGTERM' ? 143 : exitCode);

async function runPreflight(env: NodeJS.ProcessEnv) {
    const child = Bun.spawn([process.execPath, 'e2e/preflight.ts'], {
        cwd: websiteRoot,
        env,
        stderr: 'inherit',
        stdin: 'inherit',
        stdout: 'inherit',
    });

    const exitCode = await child.exited;

    if (exitCode !== 0) {
        process.exit(exitCode);
    }
}
