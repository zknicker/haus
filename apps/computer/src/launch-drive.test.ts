import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { createDriveRoutes } from './drive-migration/testing/drive-server.ts';
import type { HarnessTurnInput } from './harness/executor.ts';
import { runAgentLaunch } from './launch.ts';
import { fakeRuntimeDriver } from './runtime/testing/fake-runtime-driver.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
const runnerToken = `grtr_${'d'.repeat(43)}`;

let dataRoot: string;
let revoked: string[];
let server: ReturnType<typeof Bun.serve>;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-drive-'));
    revoked = [];
    const drive = createDriveRoutes({
        agentId: 'agt_launchdrive',
        refuse: (path) => path === 'agents/scout/MEMORY.md',
        runnerToken,
    });
    server = Bun.serve({
        fetch: async (request) => {
            const driven = await drive.handle(request);
            if (driven) {
                return driven;
            }
            const { pathname } = new URL(request.url);
            if (pathname === '/computer/runner/mint') {
                return Response.json({ runnerId: 'arc_launchdrive00000', runnerToken });
            }
            if (pathname === '/computer/runner/revoke') {
                revoked.push(((await request.json()) as { runnerId: string }).runnerId);
                return Response.json({ revoked: true });
            }
            return new Response('not found', { status: 404 });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
});

afterEach(async () => {
    disposeServerLaunchHosts('srv_launchdrive');
    server.stop(true);
    await rm(dataRoot, { force: true, recursive: true });
});

test('a Drive refusal fails the turn before the runtime starts and keeps the legacy files', async () => {
    const agentRoot = join(dataRoot, 'servers', 'srv_launchdrive', 'agents', 'agt_launchdrive');
    await mkdir(join(agentRoot, 'workspace', 'notes'), { recursive: true });
    await writeFile(join(agentRoot, 'workspace', 'MEMORY.md'), '# Scout\n');
    await writeFile(join(agentRoot, 'workspace', 'notes', 'leads.md'), 'Acme\n');
    const driver = fakeRuntimeDriver<HarnessTurnInput>();

    const turn = await runAgentLaunch({
        attachment: {
            computerId: 'cmp_launchdrive00000',
            credential: 'launch-drive-credential',
            serverId: 'srv_launchdrive',
            serverOrigin: `http://127.0.0.1:${server.port}`,
            slug: 'launch-drive',
        },
        command: {
            agentId: 'agt_launchdrive',
            agentName: 'scout',
            chatId: 'cht_drive',
            inbox: [],
            inboxDelivery: 'notice',
            modelId: 'gpt-5.6-sol',
            runId: 'run_drive_refused',
            runtimeId: 'codex',
            sessionGeneration: 1,
            totalPending: 0,
            type: 'start',
        },
        dataRoot,
        runtime,
        runtimeDriverFactory: driver.factory,
        sendFrame: () => undefined,
        serverOrigin: `http://127.0.0.1:${server.port}`,
    });

    expect(turn).toMatchObject({
        failureCode: 'launch-failed',
        failureKind: 'transport',
        status: 'failed',
        summary: "Computer could not prepare this Agent's Drive folder.",
    });
    expect(driver.record.prompts).toEqual([]);
    expect(revoked).toEqual(['arc_launchdrive00000']);
    expect(await readFile(join(agentRoot, 'workspace', 'MEMORY.md'), 'utf8')).toBe('# Scout\n');
    expect(await readFile(join(agentRoot, 'workspace', 'notes', 'leads.md'), 'utf8')).toBe(
        'Acme\n'
    );
    expect(
        await readFile(join(agentRoot, 'runtime', 'turn-run_drive_refused.log'), 'utf8')
    ).toContain('Drive preparation failed: Drive refused agents/scout/MEMORY.md: FORBIDDEN');
});
