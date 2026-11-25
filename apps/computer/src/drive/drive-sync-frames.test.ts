import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAuthority } from './drive-authority.fixture.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';
import { driveSyncFrames } from './drive-sync-frames.ts';
import { driveFolderLayout } from './folder-state.ts';
import { discardDrivePushes, holdDriveFolder, settleDriveFolder } from './turn-sync.ts';

let server: DriveServer;
let front: ReturnType<typeof Bun.serve>;
let agentsRoot: string;
afterEach(async () => {
    server.stop();
    front.stop(true);
    Bun.spawnSync(['chmod', '-R', 'u+w', agentsRoot]);
    await rm(agentsRoot, { force: true, recursive: true });
});

test('drive-pull and drive-push frames sync the Agent folder under a run credential the Computer mints', async () => {
    server = startDriveServer();
    server.write('agents/alpha/MEMORY.md', 'remember the otter', 'agt_alpha');
    const authority = startAuthority(server);
    front = authority.server;
    agentsRoot = await mkdtemp(join(tmpdir(), 'haus-drive-sync-'));
    const agentRoot = join(agentsRoot, 'agt_alpha');
    const folder = driveFolderLayout(agentRoot, 'agt_alpha').folder;
    const sync = driveSyncFrames(agentsRoot, {
        credential: 'computer-credential',
        serverOrigin: `http://127.0.0.1:${front.port}`,
    });

    expect(
        sync.receive({
            agentId: 'agt_alpha',
            runId: 'run_1',
            placementGeneration: 0,
            sessionGeneration: 2,
            type: 'drive-pull',
        })
    ).toBe(true);
    await settleDriveFolder(agentRoot);
    expect(await readFile(join(folder, 'agents', 'alpha', 'MEMORY.md'), 'utf8')).toBe(
        'remember the otter'
    );

    await mkdir(join(folder, 'agents', 'alpha', 'notes'), { recursive: true });
    await writeFile(join(folder, 'agents', 'alpha', 'notes', 'heron.md'), 'copper heron');
    expect(
        sync.receive({
            agentId: 'agt_alpha',
            runId: 'run_1',
            placementGeneration: 0,
            sessionGeneration: 2,
            type: 'drive-push',
        })
    ).toBe(true);
    await settleDriveFolder(agentRoot);
    expect(server.text('agents/alpha/notes/heron.md')).toBe('copper heron');

    const credentialHash = createHash('sha256').update('computer-credential').digest('hex');
    const mint = {
        agentId: 'agt_alpha',
        chatId: null,
        credentialHash,
        purpose: 'drive-sync',
        runId: 'run_1',
    };
    expect(authority.minted).toEqual([mint, mint]);
    expect(authority.revoked).toEqual([
        { credentialHash, runnerId: 'arc_1' },
        { credentialHash, runnerId: 'arc_2' },
    ]);
    expect(
        sync.receive({
            agentId: '../agt_alpha',
            runId: 'run_2',
            placementGeneration: 0,
            sessionGeneration: 2,
            type: 'drive-pull',
        })
    ).toBe(true);
    expect(authority.minted).toHaveLength(2);
    expect(
        sync.receive({
            agentId: 'agt_alpha',
            runId: 'run_0',
            placementGeneration: 0,
            sessionGeneration: 1,
            type: 'drive-push',
        })
    ).toBe(true);
    await settleDriveFolder(agentRoot);
    expect(authority.minted).toHaveLength(2);
    expect(sync.receive({ invocationId: 'inv_1', type: 'invoke-cancel' })).toBe(false);
});

test('a drive-push for a folder a full reset discarded sends nothing', async () => {
    server = startDriveServer();
    const authority = startAuthority(server);
    front = authority.server;
    agentsRoot = await mkdtemp(join(tmpdir(), 'haus-drive-sync-'));
    const agentRoot = join(agentsRoot, 'agt_alpha');
    const folder = driveFolderLayout(agentRoot, 'agt_alpha').folder;
    await mkdir(join(folder, 'agents', 'alpha', 'notes'), { recursive: true });
    await writeFile(join(folder, 'agents', 'alpha', 'notes', 'stale.md'), 'stale edit');
    const sync = driveSyncFrames(agentsRoot, {
        credential: 'computer-credential',
        serverOrigin: `http://127.0.0.1:${front.port}`,
    });

    const resume = discardDrivePushes(agentRoot);
    sync.receive({
        agentId: 'agt_alpha',
        runId: 'run_1',
        placementGeneration: 0,
        sessionGeneration: 2,
        type: 'drive-push',
    });
    await settleDriveFolder(agentRoot);
    resume();

    expect(server.text('agents/alpha/notes/stale.md')).toBe(null);
    expect(authority.minted).toEqual([]);
});

test('a cancelled invocation stops waiting on a stalled drive sync for its Agent folder', async () => {
    server = startDriveServer();
    const mintGate = Promise.withResolvers<void>();
    const authority = startAuthority(server, mintGate.promise);
    front = authority.server;
    agentsRoot = await mkdtemp(join(tmpdir(), 'haus-drive-sync-'));
    const agentRoot = join(agentsRoot, 'agt_alpha');
    const sync = driveSyncFrames(agentsRoot, {
        credential: 'computer-credential',
        serverOrigin: `http://127.0.0.1:${front.port}`,
    });
    sync.receive({
        agentId: 'agt_alpha',
        runId: 'run_1',
        placementGeneration: 0,
        sessionGeneration: 1,
        type: 'drive-pull',
    });

    const cancel = new AbortController();
    let ranCancelled = false;
    const held = holdDriveFolder(agentRoot, cancel.signal, async () => {
        ranCancelled = cancel.signal.aborted;
    });
    cancel.abort();
    await held;

    expect(ranCancelled).toBe(true);
    mintGate.resolve();
    await settleDriveFolder(agentRoot);
    expect(authority.minted).toHaveLength(1);
});

test('a sync renews its drive-sync credential as it runs and revokes every one it minted', async () => {
    server = startDriveServer();
    server.write('agents/alpha/a.md', 'first', 'agt_alpha');
    server.write('agents/alpha/b.md', 'second', 'agt_alpha');
    const authority = startAuthority(server);
    front = authority.server;
    agentsRoot = await mkdtemp(join(tmpdir(), 'haus-drive-sync-'));
    let clock = 0;
    const sync = driveSyncFrames(
        agentsRoot,
        { credential: 'computer-credential', serverOrigin: `http://127.0.0.1:${front.port}` },
        {
            now: () => {
                clock += 11 * 60 * 1000;
                return clock;
            },
        }
    );

    sync.receive({
        agentId: 'agt_alpha',
        runId: 'run_1',
        placementGeneration: 0,
        sessionGeneration: 1,
        type: 'drive-pull',
    });
    await settleDriveFolder(join(agentsRoot, 'agt_alpha'));

    expect(authority.minted.length).toBeGreaterThan(1);
    expect(authority.revoked).toHaveLength(authority.minted.length);
});

test('every drive sync is tracked so a stop or upgrade waits for it', async () => {
    server = startDriveServer();
    server.write('agents/alpha/MEMORY.md', 'remember the otter', 'agt_alpha');
    const authority = startAuthority(server);
    front = authority.server;
    agentsRoot = await mkdtemp(join(tmpdir(), 'haus-drive-sync-'));
    const tracked: Promise<unknown>[] = [];
    const sync = driveSyncFrames(
        agentsRoot,
        { credential: 'computer-credential', serverOrigin: `http://127.0.0.1:${front.port}` },
        {
            track: (operation) => {
                tracked.push(operation);
                return operation;
            },
        }
    );

    sync.receive({
        agentId: 'agt_alpha',
        runId: 'run_1',
        placementGeneration: 0,
        sessionGeneration: 1,
        type: 'drive-pull',
    });
    await Promise.all(tracked);

    expect(tracked).toHaveLength(1);
    const folder = driveFolderLayout(join(agentsRoot, 'agt_alpha'), 'agt_alpha').folder;
    expect(await readFile(join(folder, 'agents', 'alpha', 'MEMORY.md'), 'utf8')).toBe(
        'remember the otter'
    );
});

test('a queued sync from a replaced session generation never runs', async () => {
    server = startDriveServer();
    const authority = startAuthority(server);
    front = authority.server;
    agentsRoot = await mkdtemp(join(tmpdir(), 'haus-drive-sync-'));
    const sync = driveSyncFrames(agentsRoot, {
        credential: 'computer-credential',
        serverOrigin: `http://127.0.0.1:${front.port}`,
    });

    sync.receive({
        agentId: 'agt_alpha',
        runId: 'run_a',
        placementGeneration: 0,
        sessionGeneration: 1,
        type: 'drive-pull',
    });
    sync.receive({
        agentId: 'agt_alpha',
        runId: 'run_b',
        placementGeneration: 0,
        sessionGeneration: 1,
        type: 'drive-pull',
    });
    sync.receive({
        agentId: 'agt_alpha',
        runId: 'run_c',
        placementGeneration: 0,
        sessionGeneration: 2,
        type: 'drive-pull',
    });
    await settleDriveFolder(join(agentsRoot, 'agt_alpha'));

    expect(authority.minted.map((mint) => (mint as { runId: string }).runId)).toEqual(['run_c']);
});

test('a drive-flush frame pushes under its flush id and closes that push', async () => {
    server = startDriveServer();
    const authority = startAuthority(server);
    front = authority.server;
    agentsRoot = await mkdtemp(join(tmpdir(), 'haus-drive-sync-'));
    const sync = driveSyncFrames(agentsRoot, {
        credential: 'computer-credential',
        serverOrigin: `http://127.0.0.1:${front.port}`,
    });

    expect(
        sync.receive({
            agentId: 'agt_alpha',
            flushId: 'flush_1',
            placementGeneration: 0,
            sessionGeneration: 1,
            type: 'drive-flush',
        })
    ).toBe(true);
    await settleDriveFolder(join(agentsRoot, 'agt_alpha'));

    expect(authority.minted.map((mint) => (mint as { runId: string }).runId)).toEqual(['flush_1']);
    expect(server.requests).toContain('POST /api/agent/drive/push/close');
});
