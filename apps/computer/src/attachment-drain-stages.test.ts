import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { Effect, TestClock } from 'effect';
import { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import { harnessSessionOwner } from './harness/session-lifecycle.ts';
import {
    readAgentSessionState,
    resolveTurnSession,
    writeAgentSessionState,
} from './harness/session-store.ts';
import type { RuntimeResumeState } from './runtime/resume-state.ts';

const parked: RuntimeResumeState = { runtime: 'codex', threadId: 'thread_same', version: 1 };

function storedState() {
    return {
        ...resolveTurnSession(null, { generation: 1, modelId: 'gpt-5.6-sol', runtimeId: 'codex' }),
        resumeState: parked,
    };
}

test('completed writers cannot consume the session-parking shutdown deadline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-drain-stages-'));
    const runtime = makeTestRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const state = storedState();
    const writersDone = Promise.withResolvers<void>();
    const parking = Promise.withResolvers<void>();
    try {
        await writeAgentSessionState(root, state);
        const lease = harnessSessionOwner(runtime).begin(root);
        lease.attach({
            detach: async () => {
                await writersDone.promise;
                parking.resolve();
                await runtime.runPromise(Effect.sleep('10 seconds'));
                return parked;
            },
            stop: async () => parked,
        });
        void lease.checkpoint();
        lease.finish();
        work.track(runtime.runPromise(Effect.sleep('15 seconds')));
        const result = work.close().then(
            () => null,
            (error: unknown) => error
        );
        await runtime.runPromise(TestClock.adjust('15 seconds'));
        writersDone.resolve();
        await parking.promise;
        await runtime.runPromise(TestClock.adjust('10 seconds'));
        expect(await result).toBeNull();
        expect((await readAgentSessionState(root))?.resumeState).toEqual(parked);
    } finally {
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
});

test('a session that never parks still times out and leaves its saved checkpoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-drain-timeout-'));
    const runtime = makeTestRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const state = storedState();
    try {
        await writeAgentSessionState(root, state);
        const lease = harnessSessionOwner(runtime).begin(root);
        lease.attach({
            detach: () => new Promise<RuntimeResumeState>(() => undefined),
            stop: async () => parked,
        });
        void lease.checkpoint();
        lease.finish();
        work.track(runtime.runPromise(Effect.sleep('15 seconds')));
        const result = work.close().then(
            () => null,
            (error: unknown) => error
        );
        await runtime.runPromise(TestClock.adjust('15 seconds'));
        await runtime.runPromise(TestClock.adjust('20 seconds'));
        expect(String(await result)).toContain('before all session state was saved');
        expect(await readAgentSessionState(root)).toEqual(state);
    } finally {
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
});
