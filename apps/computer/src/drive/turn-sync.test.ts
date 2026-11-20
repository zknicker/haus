import { afterAll, afterEach, expect, test } from 'bun:test';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resetAgentState } from '../agent-reset.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { driveLaunchFixture } from './drive-launch.fixture.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';
import { discardDrivePushes, pushDriveAfterTurn } from './turn-sync.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let drive: DriveServer;
let machine: Awaited<ReturnType<typeof driveLaunchFixture>>;
afterEach(async () => {
    drive.stop();
    await machine.stop();
});

async function start() {
    drive = startDriveServer();
    drive.write('haus/AGENTS.md', 'be kind', 'usr');
    machine = await driveLaunchFixture(drive, runtime);
}

test('a turn starts on a pulled folder and its edits are pushed under its run id', async () => {
    await start();
    let seenAtTurnStart = '';
    const turn = await machine.launch(async (workspaceDir) => {
        seenAtTurnStart = await readFile(join(workspaceDir, 'drive', 'haus', 'AGENTS.md'), 'utf8');
        await writeFile(join(workspaceDir, 'drive', 'haus', 'notes.md'), 'from the turn');
    });

    expect(turn.status).toBe('completed');
    expect(seenAtTurnStart).toBe('be kind');
    expect(drive.text('haus/notes.md')).toBe('from the turn');
    expect(machine.credentials).toEqual([
        'mint run_drive_turn',
        'revoke arc_1',
        'mint run_drive_turn',
        'revoke arc_2',
    ]);
    expect(drive.requests.filter((request) => request.includes('/push/'))).toEqual([
        'POST /api/agent/drive/push/put',
        'POST /api/agent/drive/push/close',
    ]);
});

test('a turn a full reset interrupts pushes nothing back over the reset', async () => {
    await start();
    let release: (() => void) | undefined;
    const turn = await machine.launch(async (workspaceDir) => {
        release = discardDrivePushes(join(workspaceDir, '..'));
        await writeFile(join(workspaceDir, 'drive', 'haus', 'AGENTS.md'), 'stale edit');
        await writeFile(join(workspaceDir, 'drive', 'haus', 'notes.md'), 'from the turn');
    });
    release?.();

    expect(turn.status).toBe('completed');
    expect(drive.text('haus/AGENTS.md')).toBe('be kind');
    expect(drive.text('haus/notes.md')).toBe(null);
    expect(machine.credentials).toEqual(['mint run_drive_turn', 'revoke arc_1']);
    expect(drive.requests.filter((request) => request.includes('/push/'))).toEqual([]);
});

test('a full reset cancels the push in flight and clears the folder once it settles', async () => {
    await start();
    let release: (() => void) | undefined;
    await machine.launch(async (workspaceDir) => {
        release = discardDrivePushes(join(workspaceDir, '..'));
        await writeFile(join(workspaceDir, 'drive', 'haus', 'a.md'), 'a');
        await writeFile(join(workspaceDir, 'drive', 'haus', 'b.md'), 'b');
    });
    release?.();
    const events: string[] = [];
    const held = machine.holdNextPut();
    const pushing = pushDriveAfterTurn(machine.options('run_drive_push'), machine.agentRoot).then(
        () => events.push('push settled')
    );
    await held.started;

    release = discardDrivePushes(machine.agentRoot);
    await resetAgentState({
        agentId: 'agt_alpha',
        dataRoot: machine.dataRoot,
        kind: 'full',
        serverId: 'srv_drive',
    }).then(() => events.push('reset'));
    held.release();
    await pushing;
    release();

    expect(events).toEqual(['push settled', 'reset']);
    expect(drive.text('haus/a.md')).toBe(null);
    expect(drive.text('haus/b.md')).toBe(null);
    expect(drive.requests.filter((request) => request.includes('/push/'))).toEqual([]);
    await expect(stat(join(machine.agentRoot, 'workspace', 'drive'))).rejects.toThrow();
});
