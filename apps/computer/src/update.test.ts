import { expect, test } from 'bun:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getFreePort } from './test-port.ts';
import {
    type ComputerUpdateProgress,
    computerProtocolVersion,
    computerReleaseSigningPayload,
    type SignedComputerRelease,
} from './update-contract.ts';
import {
    admitActiveRun,
    readUpdateProgress,
    rollbackComputer,
    runSignedUpdate,
    verifySignedRelease,
} from './update.ts';

test('legacy persisted progress gains the stable bootstrap fields', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-update-progress-test-'));
    try {
        await writeFile(
            join(dataRoot, 'update.json'),
            `${JSON.stringify({
                detail: 'Waiting.',
                phase: 'waiting-for-agents',
                targetVersion: '1.1.0',
                updatedAt: '2026-07-27T12:00:00.000Z',
            })}\n`
        );
        expect(await readUpdateProgress(dataRoot)).toEqual({
            activeAgentCount: null,
            detail: 'Waiting.',
            downloadedBytes: null,
            failedPhase: null,
            phase: 'waiting-for-agents',
            targetVersion: '1.1.0',
            totalBytes: null,
            updatedAt: '2026-07-27T12:00:00.000Z',
        });
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a signed update waits without a kill timeout, then installs and restarts', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-update-test-'));
    const tarball = Buffer.from('verified computer tarball');
    const peer = await serveArtifact(tarball);
    const keys = generateKeyPairSync('ed25519');
    const release = signedRelease(peer.url, tarball, keys.privateKey);
    const clearRun = await admitActiveRun(dataRoot, 'run_active');
    expect(clearRun).not.toBeNull();
    let installed = false;
    let restarted = false;

    try {
        const updating = runSignedUpdate({
            currentVersion: '1.0.0',
            dataRoot,
            install: async (path) => {
                expect(await readFile(path)).toEqual(tarball);
                installed = true;
            },
            publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            release,
            restart: async () => {
                restarted = true;
            },
            verifyArtifact: async () => undefined,
        });

        await waitForPhase(dataRoot, 'waiting-for-agents');
        expect(installed).toBe(false);
        expect(await admitActiveRun(dataRoot, 'run_too_late')).toBeNull();
        await Bun.sleep(300);
        expect(installed).toBe(false);

        await clearRun?.();
        await updating;
        expect(installed).toBe(true);
        expect(restarted).toBe(true);
        expect((await readUpdateProgress(dataRoot)).phase).toBe('restarting');
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a direct observer sees every phase in order with real byte counts', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-update-test-'));
    const tarball = Buffer.from('verified computer tarball');
    const peer = await serveArtifact(tarball);
    const keys = generateKeyPairSync('ed25519');
    const release = signedRelease(peer.url, tarball, keys.privateKey);
    const observed: ComputerUpdateProgress[] = [];

    try {
        const outcome = await runSignedUpdate({
            currentVersion: '1.0.0',
            dataRoot,
            install: async () => undefined,
            onProgress: (update) => {
                observed.push(update);
            },
            publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            release,
            restart: async () => undefined,
            verifyArtifact: async () => undefined,
        });
        expect(outcome).toEqual({ status: 'updated', version: '1.1.0' });
        const phases = observed
            .map((update) => update.phase)
            .filter((phase, index, all) => phase !== all[index - 1]);
        expect(phases).toEqual([
            'requested',
            'downloading',
            'verifying',
            'waiting-for-agents',
            'installing',
            'restarting',
        ]);
        const downloads = observed.filter((update) => update.phase === 'downloading');
        const lastDownload = downloads.at(-1);
        expect(lastDownload?.downloadedBytes).toBe(tarball.length);
        expect(lastDownload?.totalBytes).toBe(tarball.length);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a rollback reports its restore and restart phases in order', async () => {
    const order: string[] = [];
    await rollbackComputer({
        onPhase: (phase) => {
            order.push(phase);
        },
        restart: async () => {
            order.push('restart');
        },
        rollback: async () => {
            order.push('rollback');
        },
    });
    expect(order).toEqual(['restoring', 'rollback', 'restarting', 'restart']);
});

test('failed signature verification never touches Computer data or installs', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-update-test-'));
    const durablePath = join(dataRoot, 'servers', 'srv_test', 'attachment.json');
    await Bun.write(durablePath, '{"credential":"keep"}\n', { createPath: true });
    const keys = generateKeyPairSync('ed25519');
    const wrongKeys = generateKeyPairSync('ed25519');
    const tarball = Buffer.from('untrusted');
    const release = signedRelease('https://example.test/haus-computer', tarball, keys.privateKey);
    let installed = false;

    try {
        expect(() =>
            verifySignedRelease(
                release,
                wrongKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString()
            )
        ).toThrow('signature verification failed');
        await expect(
            runSignedUpdate({
                currentVersion: '1.0.0',
                dataRoot,
                install: async () => {
                    installed = true;
                },
                publicKey: wrongKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
                release,
                restart: async () => undefined,
                verifyArtifact: async () => undefined,
            })
        ).rejects.toThrow('signature verification failed');
        expect(installed).toBe(false);
        expect(await readFile(durablePath, 'utf8')).toBe('{"credential":"keep"}\n');
        expect((await readUpdateProgress(dataRoot)).phase).toBe('failed');
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a Server-authorized future protocol release upgrades this Computer', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-update-test-'));
    const tarball = Buffer.from('future');
    const peer = await serveArtifact(tarball);
    const keys = generateKeyPairSync('ed25519');
    const release = signedRelease(peer.url, tarball, keys.privateKey);
    release.release.protocolVersion = computerProtocolVersion + 1;
    release.signature = sign(
        null,
        Buffer.from(computerReleaseSigningPayload(release.release)),
        keys.privateKey
    ).toString('base64');
    let installed = false;

    try {
        await runSignedUpdate({
            currentVersion: '1.0.0',
            dataRoot,
            install: async () => {
                installed = true;
            },
            publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
            release,
            restart: async () => undefined,
            verifyArtifact: async () => undefined,
        });
        expect(installed).toBe(true);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('an older protocol release cannot downgrade this Computer', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-update-test-'));
    const keys = generateKeyPairSync('ed25519');
    const release = signedRelease(
        'https://example.test/haus-computer',
        Buffer.from('older'),
        keys.privateKey
    );
    release.release.protocolVersion = 2;
    release.signature = sign(
        null,
        Buffer.from(computerReleaseSigningPayload(release.release)),
        keys.privateKey
    ).toString('base64');

    try {
        await expect(
            runSignedUpdate({
                currentVersion: '1.0.0',
                dataRoot,
                publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
                release,
                restart: async () => undefined,
                verifyArtifact: async () => undefined,
            })
        ).rejects.toThrow('protocol is older');
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('one physical Computer runs only one update job', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-update-test-'));
    const tarball = Buffer.from('verified computer tarball');
    const peer = await serveArtifact(tarball);
    const keys = generateKeyPairSync('ed25519');
    const release = signedRelease(peer.url, tarball, keys.privateKey);
    const clearRun = await admitActiveRun(dataRoot, 'run_active');
    let installs = 0;
    let restarts = 0;
    const input = {
        currentVersion: '1.0.0',
        dataRoot,
        install: async () => {
            installs += 1;
        },
        publicKey: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
        release,
        restart: async () => {
            restarts += 1;
        },
        verifyArtifact: async () => undefined,
    };

    try {
        const first = runSignedUpdate(input);
        await waitForPhase(dataRoot, 'waiting-for-agents');
        const concurrent = await runSignedUpdate(input);
        expect(concurrent.status).toBe('already-running');
        if (concurrent.status === 'already-running') {
            expect(concurrent.progress.phase).toBe('waiting-for-agents');
            expect(concurrent.progress.targetVersion).toBe('1.1.0');
        }
        await clearRun?.();
        expect((await first).status).toBe('updated');
        expect(installs).toBe(1);
        expect(restarts).toBe(1);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

async function serveArtifact(bytes: Buffer) {
    const server = Bun.serve({
        fetch: () => new Response(bytes),
        hostname: '127.0.0.1',
        port: await getFreePort(),
    });
    return {
        stop: (closeActiveConnections: boolean) => server.stop(closeActiveConnections),
        url: `http://127.0.0.1:${server.port}/haus-computer`,
    };
}

function signedRelease(
    artifactUrl: string,
    bytes: Buffer,
    privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']
): SignedComputerRelease {
    const release = {
        artifactUrl,
        protocolVersion: computerProtocolVersion,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sourceRevision: 'b'.repeat(40),
        version: '1.1.0',
    };
    return {
        release,
        signature: sign(
            null,
            Buffer.from(computerReleaseSigningPayload(release)),
            privateKey
        ).toString('base64'),
    };
}

async function waitForPhase(
    dataRoot: string,
    phase: Awaited<ReturnType<typeof readUpdateProgress>>['phase']
) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if ((await readUpdateProgress(dataRoot)).phase === phase) {
            return;
        }
        await Bun.sleep(10);
    }
    throw new Error(`Update did not reach ${phase}.`);
}
