import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computerProtocolVersion } from '@haus/api';
import { bootstrapHausDatabase } from '../../server/src/postgres/bootstrap.ts';
import { startPostgresCluster } from '../../server/test/postgres-cluster.ts';
import { type ServerState, serverStateFile } from './support/server-state.ts';

/**
 * Starts the hosted Haus Server for e2e with a throwaway PostgreSQL cluster.
 * The Playwright test runner mints App sessions directly into that test DB.
 */
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const stateDirectory = fileURLToPath(new URL('../../../.context/e2e/', import.meta.url));
const attachmentRoot = mkdtempSync(join(tmpdir(), 'haus-e2e-attachments-'));
// The browser origin is the one the Server accepts for AppSession requests.
const appOrigin = process.env.HAUS_APP_ORIGIN ?? 'http://127.0.0.1:3101';

mkdirSync(stateDirectory, { recursive: true });

const cluster = await startPostgresCluster();
const computerReleaseServer = Bun.serve({
    async fetch() {
        await Bun.sleep(400);
        return Response.json({
            release: {
                artifactUrl: 'https://updates.haus.test/1.1.0/haus-computer-aarch64-apple-darwin',
                protocolVersion: computerProtocolVersion,
                sha256: 'a'.repeat(64),
                sourceRevision: 'b'.repeat(40),
                version: '1.1.0',
            },
            signature: Buffer.alloc(64, 1).toString('base64'),
        });
    },
    hostname: '127.0.0.1',
    port: 0,
});
await bootstrapHausDatabase(cluster.databaseUrl, 'haus');

process.once('exit', () => {
    rmSync(serverStatePath, { force: true });
    rmSync(attachmentRoot, { force: true, recursive: true });
    computerReleaseServer.stop(true);
    void cluster.stop();
});
process.once('SIGTERM', () => {
    void shutdown();
});
process.once('SIGINT', () => {
    void shutdown();
});

const serverEnv = {
    ...process.env,
    HAUS_APP_ORIGIN: appOrigin,
    HAUS_ATTACHMENT_ROOT: attachmentRoot,
    HAUS_COMPUTER_RELEASE_MANIFEST_URL: `http://127.0.0.1:${computerReleaseServer.port}/latest.json`,
    HAUS_DATABASE_URL: cluster.databaseUrl,
    // Install flows mint a Linear authorize URL; nothing here ever reaches Linear.
    HAUS_LINEAR_APP_CLIENT_ID: 'haus-e2e-linear-app-client',
    NODE_ENV: 'test',
};
const serverPort = process.env.HAUS_SERVER_PORT ?? '8091';
const serverStatePath = serverStateFile();

// The Server is a child so a spec can restart it like a deploy: PostgreSQL,
// AppSessions, and the port survive, and App sockets reconnect to the new process.
let server = spawnServer();
let generation = 0;
let restarting: Promise<void> | null = null;
let shuttingDown = false;
await waitForHealthy(server);
writeServerState();
void watchServer(server);

process.on('SIGUSR2', () => {
    restarting ??= restartServer().finally(() => {
        restarting = null;
    });
});

function spawnServer() {
    return Bun.spawn([process.execPath, 'apps/server/src/haus-server.ts'], {
        cwd: workspaceRoot,
        env: serverEnv,
        stderr: 'inherit',
        stdin: 'ignore',
        stdout: 'inherit',
    });
}

// An unexpected Server exit ends the run instead of leaving specs on a dead port.
async function watchServer(watched: ReturnType<typeof spawnServer>) {
    const code = await watched.exited;
    if (watched === server && !shuttingDown && !restarting) {
        console.error(`Haus Server exited unexpectedly (${code}).`);
        await shutdown(1);
    }
}

async function restartServer() {
    server.kill('SIGTERM');
    await server.exited;
    server = spawnServer();
    await waitForHealthy(server);
    generation += 1;
    writeServerState();
    void watchServer(server);
}

async function waitForHealthy(child: ReturnType<typeof spawnServer>) {
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Haus Server exited during startup (${child.exitCode}).`);
        }
        const healthy = await fetch(`http://127.0.0.1:${serverPort}/healthz`)
            .then((response) => response.ok)
            .catch(() => false);
        if (healthy) {
            return;
        }
        await Bun.sleep(100);
    }
    throw new Error('Haus Server did not become healthy.');
}

function writeServerState() {
    const state: ServerState = {
        databaseUrl: cluster.databaseUrl,
        generation,
        harnessPid: process.pid,
        serverPid: server.pid,
    };
    writeFileSync(serverStatePath, JSON.stringify(state), { mode: 0o600 });
}

async function shutdown(exitCode = 0) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    server.kill('SIGTERM');
    await server.exited;
    computerReleaseServer.stop(true);
    await cluster.stop();
    rmSync(serverStatePath, { force: true });
    rmSync(attachmentRoot, { force: true, recursive: true });
    process.exit(exitCode);
}
