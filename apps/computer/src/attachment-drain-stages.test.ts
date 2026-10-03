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

test('completed writers cannot consume the parked-session shutdown deadline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-drain-stages-'));
    const runtime = makeTestRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const parked = {
        type: 'resume-session',
        specificationVersion: 'harness-v1',
        harnessId: 'test',
        data: { conversation: 'same' },
    } as const;
    const stopped = { ...parked, data: { conversation: 'same', stopped: true } };
    const state = {
        ...resolveTurnSession(null, { generation: 1, modelId: 'test', runtimeId: 'test' }),
        resumeState: parked,
    };
    const stopping = Promise.withResolvers<void>();
    try {
        await writeAgentSessionState(root, state);
        const lease = harnessSessionOwner(runtime).begin(root);
        const live = {
            detach: async () => parked,
            stop: async () => {
                stopping.resolve();
                await runtime.runPromise(Effect.sleep('10 seconds'));
                return stopped;
            },
        };
        lease.attach(live, async () => live);
        await lease.checkpoint();
        lease.finish();
        work.track(runtime.runPromise(Effect.sleep('15 seconds')));
        const result = work.close().then(
            () => null,
            (error: unknown) => error
        );
        await runtime.runPromise(TestClock.adjust('15 seconds'));
        await stopping.promise;
        await runtime.runPromise(TestClock.adjust('10 seconds'));
        expect(await result).toBeNull();
        expect((await readAgentSessionState(root))?.resumeState).toEqual(stopped);
    } finally {
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
});

test('a stuck parked session still times out and cannot overwrite its saved checkpoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-drain-timeout-'));
    const runtime = makeTestRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const parked = {
        type: 'resume-session',
        specificationVersion: 'harness-v1',
        harnessId: 'test',
        data: { conversation: 'same' },
    } as const;
    const state = {
        ...resolveTurnSession(null, { generation: 1, modelId: 'test', runtimeId: 'test' }),
        resumeState: parked,
    };
    const stopping = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    try {
        await writeAgentSessionState(root, state);
        const lease = harnessSessionOwner(runtime).begin(root);
        const live = { detach: async () => parked, stop: async () => parked };
        lease.attach(live, async (_state, signal) => ({
            ...live,
            stop: async () => {
                stopping.resolve();
                await new Promise<void>((resolve) =>
                    signal?.addEventListener(
                        'abort',
                        () => {
                            aborted.resolve();
                            resolve();
                        },
                        { once: true }
                    )
                );
                return { ...parked, data: { late: true } };
            },
        }));
        await lease.checkpoint();
        lease.finish();
        work.track(runtime.runPromise(Effect.sleep('15 seconds')));
        const result = work.close().then(
            () => null,
            (error: unknown) => error
        );
        await runtime.runPromise(TestClock.adjust('15 seconds'));
        await stopping.promise;
        await runtime.runPromise(TestClock.adjust('20 seconds'));
        expect(String(await result)).toContain('before all session state was saved');
        await aborted.promise;
        expect(await readAgentSessionState(root)).toEqual(state);
    } finally {
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
});
