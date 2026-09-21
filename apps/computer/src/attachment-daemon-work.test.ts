import { expect, test } from 'bun:test';
import { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';

test('reconnect keeps run admission and routes completion through the current socket', async () => {
    const runtime = makeDaemonRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const firstFrames: unknown[] = [];
    const secondFrames: unknown[] = [];
    const detachFirst = work.attachSender({
        send: (frame) => {
            firstFrames.push(frame);
            return true;
        },
    });
    expect(work.agentWork.reserve('agt_test', 'run_test').kind).toBe('reserved');

    detachFirst();
    work.attachSender({
        send: (frame) => {
            secondFrames.push(frame);
            return true;
        },
    });
    expect(work.agentWork.reserve('agt_test', 'run_test')).toEqual({ kind: 'duplicate' });
    expect(work.send({ runId: 'run_test', type: 'turn' })).toBe(true);
    expect(firstFrames).toEqual([]);
    expect(secondFrames).toEqual([{ runId: 'run_test', type: 'turn' }]);

    work.agentWork.release('agt_test', 'run_test');
    await work.close();
    await runtime.dispose();
});

test('terminal shutdown aborts active runs and waits for accepted writers', async () => {
    const runtime = makeDaemonRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const reservation = work.agentWork.reserve('agt_test', 'run_test');
    const gate = Promise.withResolvers<void>();
    let settled = false;
    const writer = work.track(
        gate.promise.then(() => {
            settled = true;
        })
    );

    const closing = work.close();
    expect(reservation.kind).toBe('reserved');
    if (reservation.kind === 'reserved') {
        expect(reservation.controller.signal.aborted).toBe(true);
    }
    await Promise.resolve();
    expect(settled).toBe(false);
    gate.resolve();
    await Promise.all([writer, closing]);
    expect(settled).toBe(true);
    await runtime.dispose();
});

test('shutdown deadline still reaps sandbox owners and reports the incomplete checkpoint', async () => {
    const { makeTestRuntime } = await import('@haus/effect');
    const { TestClock } = await import('effect');
    const { sandboxProcessOwner } = await import('./harness/sandbox-process-owner.ts');
    const runtime = makeTestRuntime();
    const work = new AttachmentDaemonWork(runtime);
    let reaped = false;
    sandboxProcessOwner(runtime).add(async () => {
        reaped = true;
    });
    work.track(new Promise(() => {}));
    const result = work.close().then(
        () => null,
        (error: unknown) => error
    );
    await runtime.runPromise(TestClock.adjust('20 seconds'));
    expect(await result).toBeInstanceOf(Error);
    expect(String(await result)).toContain('timed out');
    expect(reaped).toBe(true);
    expect(work.send({ type: 'late' })).toBe(false);
    await runtime.dispose();
});

test('shutdown drains an accepted reset before considering its old parked session', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { harnessSessionOwner } = await import('./harness/session-lifecycle.ts');
    const { resolveTurnSession, writeAgentSessionState, readAgentSessionState } = await import(
        './harness/session-store.ts'
    );
    const root = await mkdtemp(join(tmpdir(), 'haus-shutdown-reset-'));
    const runtime = makeDaemonRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const state = resolveTurnSession(null, { generation: 1, modelId: 'test', runtimeId: 'test' });
    const parked = {
        type: 'resume-session',
        specificationVersion: 'harness-v1',
        harnessId: 'test',
        data: {},
    } as const;
    await writeAgentSessionState(root, { ...state, resumeState: parked });
    const lease = harnessSessionOwner(runtime).begin(root);
    lease.attach({ detach: async () => parked, stop: async () => parked }, async () => {
        throw new Error('must not resurrect the reset session');
    });
    await lease.checkpoint();
    lease.finish();
    const gate = Promise.withResolvers<void>();
    const reset = { ...state, generation: 2 };
    work.track(gate.promise.then(() => writeAgentSessionState(root, reset)));
    try {
        const closing = work.close();
        gate.resolve();
        await closing;
        expect(await readAgentSessionState(root)).toEqual(reset);
    } finally {
        await runtime.dispose();
        await rm(root, { force: true, recursive: true });
    }
});
