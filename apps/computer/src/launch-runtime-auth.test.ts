import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import type { HarnessTurnInput } from './harness/executor.ts';
import { type AgentStartCommand, runAgentLaunch } from './launch.ts';
import { fakeRuntimeDriver, finishedTurn } from './runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from './runtime/turn-event.ts';
import { readRuntimeIssues } from './runtime-issues.ts';

// The exact failure Codex settled Blippy's turn with, typed beside the finished turn.
const codexAuthFailure: TurnEvent = {
    category: 'service',
    severity: 'error',
    title: 'unexpected status 401 Unauthorized: Incorrect API key provided: sk-svcac***fvMA. You can find your API key at https://platform.openai.com/account/api-keys., url: https://chatgpt.com/backend-api/codex/responses',
    type: 'session-failure',
};

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let dataRoot: string;
let server: ReturnType<typeof Bun.serve>;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-auth-'));
    server = Bun.serve({
        fetch: (request) => {
            const { pathname } = new URL(request.url);
            if (pathname === '/computer/runner/mint') {
                return Response.json({
                    runnerId: 'arc_launchauth000000',
                    runnerToken: `grtr_${'a'.repeat(43)}`,
                });
            }
            if (pathname === '/computer/runner/revoke') {
                return Response.json({ revoked: true });
            }
            return new Response('not found', { status: 404 });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
});

afterEach(async () => {
    disposeServerLaunchHosts('srv_launchauth');
    server.stop(true);
    await rm(dataRoot, { force: true, recursive: true });
});

test('a rejected Codex credential fails the turn, raises the runtime issue, and a later success clears it', async () => {
    const failed = await launch('run_auth_failed', [codexAuthFailure, ...finishedTurn()]);
    expect(failed).toMatchObject({ failureKind: 'authentication', status: 'failed' });
    // The Computer report carries this issue to the Agent hover card's sign-in prompt.
    expect(await readRuntimeIssues(dataRoot)).toEqual([
        expect.objectContaining({ kind: 'authentication', runtimeId: 'codex' }),
    ]);

    const recovered = await launch('run_auth_recovered', finishedTurn());
    expect(recovered.status).toBe('completed');
    expect(await readRuntimeIssues(dataRoot)).toEqual([]);
});

function launch(runId: string, events: TurnEvent[]) {
    const command: AgentStartCommand = {
        agentId: 'agt_launchauth',
        chatId: 'cht_test',
        inbox: [],
        inboxDelivery: 'notice',
        modelId: 'gpt-5.6-sol',
        runId,
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
    const driver = fakeRuntimeDriver<HarnessTurnInput>({ turn: () => events });
    return runAgentLaunch({
        attachment: {
            computerId: 'cmp_launchauth0000000',
            credential: 'launch-auth-credential',
            serverId: 'srv_launchauth',
            serverOrigin: `http://127.0.0.1:${server.port}`,
            slug: 'launch-auth',
        },
        command,
        dataRoot,
        runtimeDriverFactory: driver.factory,
        runtime,
        sendFrame: () => undefined,
        serverOrigin: `http://127.0.0.1:${server.port}`,
    });
}
