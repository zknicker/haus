import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';
import { driveFolderLayout } from './folder-state.ts';
import { type DriveRun, flushDriveForRun, pullDriveForRun, pushDriveForRun } from './turn-sync.ts';

let server: DriveServer;
let agentRoot: string;
afterEach(async () => {
    server.stop();
    Bun.spawnSync(['chmod', '-R', 'u+w', agentRoot]);
    await rm(agentRoot, { force: true, recursive: true });
});

test('a flush closes its push even when the folder has nothing to send', async () => {
    server = startDriveServer();
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-machine-change-'));
    await pullDriveForRun(agentRoot, run({ runId: 'run_1' }));

    await flushDriveForRun(agentRoot, run({ runId: 'flush_1' }));

    expect(server.requests.filter((line) => line.includes('/push/'))).toEqual([
        'POST /api/agent/drive/push/close',
    ]);
});

test('a flush pushes a local edit and then closes its push', async () => {
    server = startDriveServer();
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-machine-change-'));
    await pullDriveForRun(agentRoot, run({ runId: 'run_1' }));
    const notes = join(folder(), 'agents', 'alpha', 'notes');
    await mkdir(notes, { recursive: true });
    await writeFile(join(notes, 'heron.md'), 'copper heron');

    await flushDriveForRun(agentRoot, run({ runId: 'flush_1' }));

    expect(server.text('agents/alpha/notes/heron.md')).toBe('copper heron');
    expect(server.requests.at(-1)).toBe('POST /api/agent/drive/push/close');
});

test('moving back sets the old folder aside and pulls a fresh one, and an older frame does nothing', async () => {
    server = startDriveServer();
    server.write('agents/alpha/MEMORY.md', 'remember the otter', 'agt_alpha');
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-machine-change-'));
    await pullDriveForRun(agentRoot, run({ runId: 'run_1' }));
    const notes = join(folder(), 'agents', 'alpha', 'notes');
    await mkdir(notes, { recursive: true });
    await writeFile(join(notes, 'unpushed.md'), 'left behind');
    server.write('agents/alpha/MEMORY.md', 'written on the other Mac', 'agt_alpha');

    await pullDriveForRun(agentRoot, run({ placementGeneration: 2, runId: 'run_2' }));
    await pushDriveForRun(agentRoot, run({ placementGeneration: 2, runId: 'run_2' }));

    expect(await readFile(join(folder(), 'agents', 'alpha', 'MEMORY.md'), 'utf8')).toBe(
        'written on the other Mac'
    );
    expect(server.text('agents/alpha/notes/unpushed.md')).toBe(null);
    const [kept] = await readdir(join(agentRoot, 'workspace', 'drive-before-move'));
    expect(kept).toStartWith('placement-0-');
    expect(
        await readFile(
            join(
                agentRoot,
                'workspace',
                'drive-before-move',
                kept ?? '',
                'agents',
                'alpha',
                'notes',
                'unpushed.md'
            ),
            'utf8'
        )
    ).toBe('left behind');

    const before = server.requests.length;
    await pullDriveForRun(agentRoot, run({ placementGeneration: 1, runId: 'run_0' }));
    expect(server.requests.length).toBe(before);
});

function folder() {
    return driveFolderLayout(agentRoot, 'agt_alpha').folder;
}

function run(input: { placementGeneration?: number; runId: string }) {
    return {
        agentId: 'agt_alpha',
        current: () => true,
        mint: async () => ({ runnerId: `arc_${input.runId}`, runnerToken: 'agt_alpha' }),
        now: Date.now,
        placementGeneration: input.placementGeneration ?? 0,
        revoke: async () => undefined,
        runId: input.runId,
        serverOrigin: server.origin,
        warn: (event: string, detail: string) => {
            throw new Error(`${event}: ${detail}`);
        },
    } satisfies DriveRun;
}
