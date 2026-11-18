import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { readProcessCommand } from './dev-stack-processes.mjs';

/**
 * Files storage for the dev stack: a per-worktree versitygw S3 gateway over a
 * plain directory, standing in for the private R2 bucket. `.env.schema` resolves
 * the bucket and static development credentials; the stack supplies the
 * endpoint. An explicit `HAUS_ARTIFACT_R2_ENDPOINT` (a real bucket during
 * supervised verification) or disabled Files storage skips the gateway.
 */
export function shouldRunDevObjectStorage(environment) {
    return (
        environment.HAUS_ENABLE_ARTIFACT_STORAGE === 'true' &&
        !environment.HAUS_ARTIFACT_R2_ENDPOINT
    );
}

export function prepareDevObjectStorage(environment, port, options = {}) {
    const executable = options.executable ?? resolveVersitygwBinary();
    const storageRoot = environment.HAUS_OBJECT_STORAGE_ROOT;
    const bucket = requireValue(environment, 'HAUS_ARTIFACT_R2_BUCKET');
    const accessKeyId = requireValue(environment, 'HAUS_ARTIFACT_R2_ACCESS_KEY_ID');
    const secretAccessKey = requireValue(environment, 'HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY');
    const dataRoot = path.join(storageRoot, 'data');
    const metadataRoot = path.join(storageRoot, 'metadata');

    // The posix backend treats each top-level directory as a bucket.
    fs.mkdirSync(path.join(dataRoot, bucket), { recursive: true });
    fs.mkdirSync(metadataRoot, { recursive: true });

    return {
        // Credentials ride the gateway's own env names, never argv, so `ps` shows none.
        args: [
            '--port',
            `127.0.0.1:${port}`,
            // The Server signs with R2's `auto` region.
            '--region',
            'auto',
            '--health',
            healthPath,
            '--quiet',
            'posix',
            // Sidecar metadata needs no extended-attribute support from the filesystem.
            '--sidecar',
            metadataRoot,
            dataRoot,
        ],
        endpoint: `http://127.0.0.1:${port}`,
        env: { ROOT_ACCESS_KEY_ID: accessKeyId, ROOT_SECRET_ACCESS_KEY: secretAccessKey },
        executable,
        pidFile: path.join(storageRoot, 'gateway.pid'),
        port,
    };
}

export async function reserveDevObjectStoragePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : null;
    await new Promise((resolve) => server.close(resolve));
    if (!port) {
        throw new Error('Failed to reserve a development Files storage port.');
    }
    return port;
}

export async function waitForDevObjectStorage(storage, child, fetchImpl = fetch) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`Development Files storage exited with code ${child.exitCode}.`);
        }
        const ready = await fetchImpl(`${storage.endpoint}${healthPath}`)
            .then((response) => response.ok)
            .catch(() => false);
        if (ready) {
            fs.writeFileSync(storage.pidFile, String(child.pid));
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Development Files storage did not become ready.');
}

/** Stops a gateway a crashed stack left running; returns how many it stopped. */
export function stopStaleDevObjectStorage(environment, options = {}) {
    const fileSystem = options.fileSystem ?? fs;
    const readCommand = options.readCommand ?? readProcessCommand;
    const killProcess = options.killProcess ?? ((pid, signal) => process.kill(pid, signal));
    const storageRoot = environment.HAUS_OBJECT_STORAGE_ROOT;
    const pidFile = path.join(storageRoot, 'gateway.pid');

    if (!fileSystem.existsSync(pidFile)) {
        return 0;
    }
    const pid = Number(fileSystem.readFileSync(pidFile, 'utf8').trim());
    fileSystem.rmSync(pidFile, { force: true });
    const command = Number.isInteger(pid) && pid > 0 ? readCommand(pid) : '';
    // A recycled pid belongs to some other process; only stop this worktree's gateway.
    if (!(command.includes('versitygw') && command.includes(storageRoot))) {
        return 0;
    }
    killProcess(pid, 'SIGTERM');
    return 1;
}

const healthPath = '/health';

function resolveVersitygwBinary() {
    const candidates = [
        process.env.HAUS_VERSITYGW_BIN,
        '/opt/homebrew/bin/versitygw',
        '/usr/local/bin/versitygw',
        'versitygw',
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0) {
            return candidate;
        }
    }
    throw new Error(
        'versitygw is required for development Files storage. Install it with `brew install versitygw`.'
    );
}

function requireValue(environment, name) {
    const value = environment[name];
    if (!value) {
        throw new Error(`${name} is required for development Files storage.`);
    }
    return value;
}
