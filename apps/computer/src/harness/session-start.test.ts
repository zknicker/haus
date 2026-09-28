import { afterEach, expect, test } from 'bun:test';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import { isRetryableRuntimeFailure } from '../runtime-failure.ts';
import { reportHarnessTurnFailure } from '../turn-failure-report.ts';
import { HarnessSessionOwner } from './session-lifecycle.ts';
import { type HarnessSessionStart, startHarnessSession } from './session-start.ts';
import { HarnessStartupTimeoutError, maxConcurrentHarnessStarts } from './start-gate.ts';

let runtime = makeTestRuntime();
afterEach(async () => {
    await runtime.dispose();
    runtime = makeTestRuntime();
});

test('an aborted turn leaves the start queue without taking a slot', async () => {
    const pending: Array<() => void> = [];
    const holders = Array.from({ length: maxConcurrentHarnessStarts }, () =>
        startHarnessSession(
            sessionStart(() => new Promise((resolve) => pending.push(() => resolve(session()))))
        )
    );
    const controller = new AbortController();
    let queuedRan = false;
    const queued = startHarnessSession({
        ...sessionStart(async () => {
            queuedRan = true;
            return session();
        }),
        signal: controller.signal,
    });
    await tick();
    controller.abort(new Error('stopped'));
    await expect(queued).rejects.toThrow('stopped');
    for (const release of pending) {
        release();
    }
    await Promise.all(holders);
    expect(queuedRan).toBe(false);
});

test('session starts share one machine-wide gate', async () => {
    const pending: Array<() => void> = [];
    const starts = Array.from({ length: maxConcurrentHarnessStarts + 2 }, () =>
        startHarnessSession(
            sessionStart(() => new Promise((resolve) => pending.push(() => resolve(session()))))
        )
    );
    await tick();
    expect(pending).toHaveLength(maxConcurrentHarnessStarts);
    while (pending.length > 0) {
        pending.shift()?.();
        await tick();
    }
    await Promise.all(starts);
});

test('a hung start fails as a retryable timeout and destroys the late session', async () => {
    const late = Promise.withResolvers<ReturnType<typeof session>>();
    let destroyed = false;
    const starting = startHarnessSession(sessionStart(() => late.promise)).catch(
        (error: unknown) => error
    );
    await tick();

    await runtime.runPromise(TestClock.adjust('2 minutes'));
    const failure = await starting;
    expect(failure).toBeInstanceOf(HarnessStartupTimeoutError);
    const report = await reportHarnessTurnFailure(
        runtime,
        { agentId: 'agt_start', runId: 'run_start', runtimeId: 'codex' },
        failure
    );
    expect(report).toMatchObject({ failureKind: 'timeout', status: 'failed' });
    expect(isRetryableRuntimeFailure('timeout')).toBe(true);

    late.resolve({
        ...session(),
        destroy: async () => {
            destroyed = true;
        },
    });
    await tick();
    expect(destroyed).toBe(true);
});

function sessionStart(create: () => Promise<unknown>): HarnessSessionStart {
    return {
        agent: { createSession: create as unknown as HarnessAgent['createSession'] },
        agentId: 'agt_start',
        lease: new HarnessSessionOwner().begin('/tmp/haus-session-start'),
        phase: async () => undefined,
        restartNative: false,
        resumeFrom: undefined,
        runtime,
        sessionId: 'agt_start-1',
        timings: new AgentTurnTimings(),
    };
}

function session() {
    return {
        destroy: async () => undefined,
        detach: async () => ({}),
        isResume: false,
        sessionId: 'engine_session',
        stop: async () => ({}),
    };
}

async function tick() {
    await new Promise((resolve) => setTimeout(resolve, 10));
}
