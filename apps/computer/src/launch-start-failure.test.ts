import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import { type DaemonRuntime, makeDaemonRuntime } from './daemon-runtime.ts';
import type { HarnessTurnInput } from './harness/executor.ts';
import { type AgentStartCommand, runAgentLaunch } from './launch.ts';
import { RuntimeResumeRejectedError } from './runtime/resume-rejected.ts';
import { fakeRuntimeDriver, finishedTurn } from './runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from './runtime/turn-event.ts';

type CreateSession = (options: { resumeFrom?: unknown }) => void;

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let dataRoot: string;
let server: ReturnType<typeof Bun.serve>;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-start-'));
    server = Bun.serve({
        fetch: (request) => {
            const { pathname } = new URL(request.url);
            if (pathname === '/computer/runner/mint') {
                return Response.json({
                    runnerId: 'arc_launchstart00000',
                    runnerToken: `grtr_${'b'.repeat(43)}`,
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
    disposeServerLaunchHosts('srv_launchstart');
    server.stop(true);
    await rm(dataRoot, { force: true, recursive: true });
});

test('a transient failure resuming the stored session is retried, never rotated', async () => {
    expect((await launch('run_cold')).status).toBe('completed');

    const failed = await launch('run_resume_blip', {
        onCreate: ({ resumeFrom }) => {
            if (resumeFrom) {
                throw new Error('fetch failed');
            }
        },
    });

    expect(failed).toMatchObject({
        failureCode: 'provider-unavailable',
        failureKind: 'transport',
        status: 'failed',
    });
    expect(failed.failureFingerprint).toMatch(/^[0-9a-f]{16}$/u);
});

test('a missing runtime session is reported for Server-authorized recovery', async () => {
    expect((await launch('run_cold')).status).toBe('completed');

    const failed = await launch('run_resume_missing', {
        onCreate: ({ resumeFrom }) => {
            if (resumeFrom) {
                throw new RuntimeResumeRejectedError(
                    'codex',
                    'missing',
                    'No conversation found with session ID: native_1'
                );
            }
        },
    });

    expect(failed).toMatchObject({
        failureCode: 'session-resume-rejected',
        failureKind: 'session-resume',
        status: 'failed',
    });
});

test('a resumed conversation the runtime cannot find once prompted is reported for recovery', async () => {
    const replayRejected: TurnEvent[] = [
        {
            error: new RuntimeResumeRejectedError(
                'claude-code',
                'missing',
                'No conversation found with session ID: 7f3c'
            ),
            type: 'error',
        },
    ];
    // A cold session has nothing to rotate away from.
    const cold = await launch('run_cold_rejected', { parts: replayRejected });
    expect(cold.status).toBe('failed');
    expect(cold.failureKind).not.toBe('session-resume');
    expect((await launch('run_cold')).status).toBe('completed');

    const failed = await launch('run_replay_rejected', { parts: replayRejected });

    expect(failed).toMatchObject({ failureKind: 'session-resume', status: 'failed' });
});

test('a Stop during session creation settles as interrupted, not a resume failure', async () => {
    expect((await launch('run_cold')).status).toBe('completed');
    const controller = new AbortController();

    const stopped = await launch('run_stopped', {
        onCreate: ({ resumeFrom }) => {
            if (resumeFrom) {
                controller.abort();
                throw new Error('session creation aborted');
            }
        },
        signal: controller.signal,
    });

    expect(stopped.status).toBe('interrupted');
    expect(stopped.failureKind).toBeUndefined();
});

test('an expired MCP session mid-stream on a resumed session is not a resume rejection', async () => {
    expect((await launch('run_cold')).status).toBe('completed');

    const failed = await launch('run_mcp_session', {
        parts: [{ error: new Error('Streamable HTTP error: Session not found'), type: 'error' }],
    });

    expect(failed.status).toBe('failed');
    expect(failed.failureKind).not.toBe('session-resume');
});

test('a context-window overflow tells the owner to reset the session', async () => {
    const failed = await launch('run_overflow', {
        parts: [
            {
                error: new Error('prompt is too long: 201234 tokens > 200000 maximum'),
                type: 'error',
            },
        ],
    });

    expect(failed).toMatchObject({
        failureCode: 'context-too-large',
        failureKind: 'input',
        status: 'failed',
        summary: "Context window full — reset this agent's session.",
    });
});

test('a turn stalled past the no-progress deadline fails as a retryable timeout', async () => {
    const testRuntime = makeTestRuntime();
    try {
        const stalling = launch('run_stalled', {
            parts: [{ id: 'r1', type: 'reasoning-start' }],
            runtime: testRuntime,
            stall: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
        await testRuntime.runPromise(TestClock.adjust('16 minutes'));

        expect(await stalling).toMatchObject({
            failureCode: 'turn-stalled',
            failureKind: 'timeout',
            status: 'failed',
        });
    } finally {
        await testRuntime.dispose();
    }
});

function launch(
    runId: string,
    options: {
        onCreate?: CreateSession;
        parts?: TurnEvent[];
        runtime?: DaemonRuntime;
        signal?: AbortSignal;
        /** Goes silent after `parts` until the turn is aborted. */
        stall?: boolean;
    } = {}
) {
    const command: AgentStartCommand = {
        agentId: 'agt_launchstart',
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
    const driver = fakeRuntimeDriver<HarnessTurnInput>({
        detach: () => ({ runtime: 'codex', threadId: 'native_1', version: 1 }),
        open: ({ resumeFrom }) => options.onCreate?.({ resumeFrom }),
        async *turn({ signal }) {
            yield* options.parts ?? finishedTurn();
            if (options.stall) {
                if (!signal.aborted) {
                    await new Promise((resolve) =>
                        signal.addEventListener('abort', resolve, { once: true })
                    );
                }
                yield { type: 'abort' };
            }
        },
    });
    return runAgentLaunch({
        attachment: {
            computerId: 'cmp_launchstart00000',
            credential: 'launch-start-credential',
            serverId: 'srv_launchstart',
            serverOrigin: `http://127.0.0.1:${server.port}`,
            slug: 'launch-start',
        },
        command,
        dataRoot,
        runtimeDriverFactory: driver.factory,
        runtime: options.runtime ?? runtime,
        sendFrame: () => undefined,
        serverOrigin: `http://127.0.0.1:${server.port}`,
        signal: options.signal,
    });
}
