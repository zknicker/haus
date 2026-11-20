import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';
import { driveSyncFrames } from './drive-sync-frames.ts';
import { driveFolderLayout } from './folder-state.ts';
import { holdDriveFolder, settleDriveFolder } from './turn-sync.ts';

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
            sessionGeneration: 2,
            type: 'drive-push',
        })
    ).toBe(true);
    await settleDriveFolder(agentRoot);
    expect(server.text('agents/alpha/notes/heron.md')).toBe('copper heron');

    const credentialHash = createHash('sha256').update('computer-credential').digest('hex');
    const mint = { agentId: 'agt_alpha', chatId: null, credentialHash, runId: 'run_1' };
    expect(authority.minted).toEqual([mint, mint]);
    expect(authority.revoked).toEqual([
        { credentialHash, runnerId: 'arc_1' },
        { credentialHash, runnerId: 'arc_2' },
    ]);
    expect(
        sync.receive({
            agentId: '../agt_alpha',
            runId: 'run_2',
            sessionGeneration: 2,
            type: 'drive-pull',
        })
    ).toBe(true);
    expect(authority.minted).toHaveLength(2);
    expect(
        sync.receive({
            agentId: 'agt_alpha',
            runId: 'run_0',
            sessionGeneration: 1,
            type: 'drive-push',
        })
    ).toBe(true);
    await settleDriveFolder(agentRoot);
    expect(authority.minted).toHaveLength(2);
    expect(sync.receive({ invocationId: 'inv_1', type: 'invoke-cancel' })).toBe(false);
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

function startAuthority(drive: DriveServer, mintGate: Promise<void> = Promise.resolve()) {
    const minted: unknown[] = [];
    const revoked: unknown[] = [];
    const front = Bun.serve({
        async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/runner/mint') {
                const body = (await request.json()) as { agentId: string };
                minted.push(body);
                await mintGate;
                return Response.json({
                    runnerId: `arc_${minted.length}`,
                    runnerToken: body.agentId,
                });
            }
            if (url.pathname === '/computer/runner/revoke') {
                revoked.push(await request.json());
                return Response.json({});
            }
            return await fetch(new URL(`${url.pathname}${url.search}`, drive.origin), {
                body: request.body,
                headers: request.headers,
                method: request.method,
            });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    return { minted, revoked, server: front };
}
