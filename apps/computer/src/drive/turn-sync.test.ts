import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { HarnessTurnInput } from '../harness/executor.ts';
import { runAgentLaunch } from '../launch.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import { type DriveServer, startDriveServer } from './drive-server.fixture.ts';
import { discardDrivePushes } from './turn-sync.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let drive: DriveServer;
let front: ReturnType<typeof Bun.serve>;
let dataRoot: string;
afterEach(async () => {
    drive.stop();
    front.stop(true);
    await rm(dataRoot, { force: true, recursive: true });
});

test('a turn starts on a pulled folder and its edits are pushed under its run id', async () => {
    drive = startDriveServer();
    drive.write('haus/AGENTS.md', 'be kind', 'usr');
    const credentials = serveFront();
    let seenAtTurnStart = '';
    const turn = await launch(async (workspaceDir) => {
        seenAtTurnStart = await readFile(join(workspaceDir, 'drive', 'haus', 'AGENTS.md'), 'utf8');
        await writeFile(join(workspaceDir, 'drive', 'haus', 'notes.md'), 'from the turn');
    });

    expect(turn.status).toBe('completed');
    expect(seenAtTurnStart).toBe('be kind');
    expect(drive.text('haus/notes.md')).toBe('from the turn');
    expect(credentials).toEqual([
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
    drive = startDriveServer();
    drive.write('haus/AGENTS.md', 'be kind', 'usr');
    const credentials = serveFront();
    let release: (() => void) | undefined;
    const turn = await launch(async (workspaceDir) => {
        release = discardDrivePushes(join(workspaceDir, '..'));
        await writeFile(join(workspaceDir, 'drive', 'haus', 'AGENTS.md'), 'stale edit');
        await writeFile(join(workspaceDir, 'drive', 'haus', 'notes.md'), 'from the turn');
    });
    release?.();

    expect(turn.status).toBe('completed');
    expect(drive.text('haus/AGENTS.md')).toBe('be kind');
    expect(drive.text('haus/notes.md')).toBe(null);
    expect(credentials).toEqual(['mint run_drive_turn', 'revoke arc_1']);
    expect(drive.requests.filter((request) => request.includes('/push/'))).toEqual([]);
});

function serveFront() {
    const credentials: string[] = [];
    front = Bun.serve({
        port: 0,
        fetch: async (request) => {
            const url = new URL(request.url);
            if (url.pathname === '/computer/runner/mint') {
                credentials.push(`mint ${((await request.json()) as { runId: string }).runId}`);
                return Response.json({
                    runnerId: `arc_${credentials.filter((line) => line.startsWith('mint')).length}`,
                    runnerToken: 'agt_alpha',
                });
            }
            if (url.pathname === '/computer/runner/revoke') {
                credentials.push(
                    `revoke ${((await request.json()) as { runnerId: string }).runnerId}`
                );
                return Response.json({ revoked: true });
            }
            if (
                !(
                    url.pathname.startsWith('/api/agent/drive/') ||
                    url.pathname.startsWith('/api/agent/artifacts/') ||
                    url.pathname.startsWith('/blob/') ||
                    url.pathname.includes('/download')
                )
            ) {
                return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
            }
            return await fetch(new URL(`${url.pathname}${url.search}`, drive.origin), {
                body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
                headers: request.headers,
                method: request.method,
            });
        },
    });
    return credentials;
}

async function launch(during: (workspaceDir: string) => Promise<void>) {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-drive-launch-'));
    const driver = fakeRuntimeDriver<HarnessTurnInput>({
        async *turn({ input }) {
            await during(input.workspaceDir);
            yield* finishedTurn();
        },
    });
    return await runAgentLaunch({
        attachment: {
            computerId: 'cmp_drive',
            credential: 'computer-credential',
            serverId: 'srv_drive',
            serverOrigin: `http://127.0.0.1:${front.port}`,
            slug: 'drive',
        },
        command: {
            agentId: 'agt_alpha',
            agentName: 'alpha',
            chatId: 'cht_drive',
            inbox: [],
            inboxDelivery: 'concrete',
            modelId: 'gpt-5.6-sol',
            runId: 'run_drive_turn',
            runtimeId: 'codex',
            sessionGeneration: 1,
            totalPending: 0,
            type: 'start',
        },
        dataRoot,
        runtime,
        runtimeDriverFactory: driver.factory,
        sendFrame: () => undefined,
        serverOrigin: `http://127.0.0.1:${front.port}`,
    });
}
