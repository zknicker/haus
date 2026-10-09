import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloudAgentObservation } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import type { EnrichObservation } from './observation-reports.ts';
import { CloudAgentWorkSupervisor } from './work-runner.ts';

const entry = {
    cancelRequested: false,
    provider: 'cursor' as const,
    providerAgentId: 'bc_one',
    providerRunId: 'run_one',
    runId: 'car_1234567890abcdef',
    status: 'running' as const,
    workId: 'caw_1234567890abcdef',
};
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) {
        await close();
    }
});

async function fixture(enrich?: EnrichObservation) {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-watch-'));
    const runtime = makeTestRuntime();
    const provider = createFakeCloudAgentProvider();
    provider.read = () =>
        Promise.resolve({ observedAt: new Date(0).toISOString(), status: 'running' });
    const work = new CloudAgentWorkSupervisor(runtime, {
        dataRoot,
        serverId: 'srv_cloud',
        provider: () => provider,
        enrich,
    });
    const observations: CloudAgentObservation[] = [];
    work.attach((observation) => observations.push(observation));
    cleanup.push(async () => {
        await work.close();
        await runtime.dispose();
        await rm(dataRoot, { recursive: true, force: true });
    });
    return { dataRoot, observations, provider, runtime, work };
}

test('a failed reconnect read retries with virtual time and eventually settles', async () => {
    const f = await fixture();
    let attempts = 0;
    f.provider.read = () =>
        ++attempts === 1
            ? Promise.reject(new Error('temporarily offline'))
            : Promise.resolve({ observedAt: new Date(60_000).toISOString(), status: 'completed' });
    await f.work.reconcile([entry]);
    expect(f.observations).toHaveLength(0);
    await f.runtime.runPromise(TestClock.adjust('59 seconds'));
    expect(attempts).toBe(1);
    await f.runtime.runPromise(TestClock.adjust('1 second'));
    expect(f.observations.at(-1)?.status).toBe('completed');
    await f.runtime.runPromise(TestClock.adjust('1 hour'));
    expect(attempts).toBe(2);
});

test('a failed cancellation keeps its retry owner until the provider settles', async () => {
    const f = await fixture();
    let attempts = 0;
    f.provider.cancel = () =>
        ++attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
    f.provider.read = () =>
        Promise.resolve({ observedAt: new Date(60_000).toISOString(), status: 'cancelled' });
    await f.work.cancel({ ...entry, type: 'cloud-agent-cancel' });
    expect(f.observations).toHaveLength(0);
    await f.runtime.runPromise(TestClock.adjust('60 seconds'));
    expect(f.observations.at(-1)?.status).toBe('cancelled');
    expect(attempts).toBe(2);
});

test('cancellation interrupts a live stream and waits for its cleanup before cancelling', async () => {
    const f = await fixture();
    const started = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const cancelled = Promise.withResolvers<void>();
    let cancelCalls = 0;
    f.provider.subscribe = async (_ref, _observe, signal) => {
        signal.addEventListener('abort', () => aborted.resolve(), { once: true });
        started.resolve();
        await release.promise;
    };
    f.provider.cancel = async () => {
        cancelCalls += 1;
        cancelled.resolve();
    };
    await f.work.reconcile([entry]);
    await started.promise;
    await f.work.cancel({ ...entry, type: 'cloud-agent-cancel' });
    await aborted.promise;
    expect(cancelCalls).toBe(0);
    release.resolve();
    await cancelled.promise;
    expect(cancelCalls).toBe(1);
});

test('socket detach aborts and joins the pending read without cancelling hosted work', async () => {
    const f = await fixture();
    const started = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let cancelled = false;
    f.provider.cancel = async () => {
        cancelled = true;
    };
    f.provider.read = async (_ref, signal) => {
        signal?.addEventListener('abort', () => aborted.resolve(), { once: true });
        started.resolve();
        await release.promise;
        return { observedAt: new Date(0).toISOString(), status: 'completed' };
    };
    const pending = f.work.reconcile([entry]);
    await started.promise;
    let closed = false;
    const closing = f.work.detach().then(() => {
        closed = true;
    });
    await aborted.promise;
    expect(closed).toBe(false);
    release.resolve();
    await Promise.all([closing, pending]);
    expect(closed).toBe(true);
    expect(cancelled).toBe(false);
    expect(f.observations).toHaveLength(0);
});

test('a detached stream polls every five seconds and closes with its connection', async () => {
    const f = await fixture();
    let reads = 0;
    f.provider.subscribe = () => Promise.resolve();
    f.provider.read = async () => {
        reads += 1;
        return { observedAt: new Date(reads).toISOString(), status: 'running' };
    };
    await f.work.reconcile([entry]);
    await f.runtime.runPromise(TestClock.adjust('0 seconds'));
    const initial = reads;
    await f.runtime.runPromise(TestClock.adjust('5 seconds'));
    expect(reads).toBe(initial + 1);
    await f.work.detach();
    await f.runtime.runPromise(TestClock.adjust('1 hour'));
    expect(reads).toBe(initial + 1);
});

test('reconnect recovers a lost launch address from disk before cancelling', async () => {
    const f = await fixture();
    const journal = new CloudLaunchJournal(f.dataRoot);
    await journal.claim('srv_cloud', entry);
    await journal.record('srv_cloud', entry, {
        providerAgentId: 'bc_recovered',
        providerRunId: 'run_recovered',
        providerUrl: 'https://cursor.com/agents?id=bc_recovered',
        status: 'running',
    });
    const cancelled: Array<string | null> = [];
    f.provider.cancel = async (ref) => {
        cancelled.push(ref.providerAgentId);
    };
    f.provider.read = async () => ({ observedAt: new Date(1).toISOString(), status: 'cancelled' });
    await f.work.reconcile([
        { ...entry, cancelRequested: true, providerAgentId: null, providerRunId: null },
    ]);
    expect(cancelled).toEqual(['bc_recovered']);
    expect(f.observations[0]?.providerUrl).toBe('https://cursor.com/agents?id=bc_recovered');
    expect(f.observations.at(-1)?.status).toBe('cancelled');
});

test('an unknown launch reports recovery needed and never reads or cancels null addresses', async () => {
    const f = await fixture();
    // Claimed `launching` without an acknowledgement: the provider may hold the Run.
    await new CloudLaunchJournal(f.dataRoot).claim('srv_cloud', entry);
    let called = false;
    f.provider.read = () => {
        called = true;
        return Promise.reject(new Error('null address'));
    };
    f.provider.cancel = () => {
        called = true;
        return Promise.resolve();
    };
    await f.work.reconcile([
        { ...entry, cancelRequested: true, providerAgentId: null, providerRunId: null },
    ]);
    expect(called).toBe(false);
    expect(f.observations[0]?.activity?.summary).toContain('Launch confirmation unavailable');
    expect(f.observations[0]?.status).toBe('queued');
});

test('slow pull request evidence stays before later terminal observations', async () => {
    const reading = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const f = await fixture(async (observation) => {
        if (observation.branches) {
            reading.resolve();
            await release.promise;
            return { ...observation, summary: 'GitHub evidence attached' };
        }
        return observation;
    });
    const started = Promise.withResolvers<void>();
    let observe: Parameters<typeof f.provider.subscribe>[1] = () => undefined;
    f.provider.subscribe = (_ref, listener, signal) =>
        new Promise<void>((resolve) => {
            observe = listener;
            signal.addEventListener('abort', () => resolve(), { once: true });
            started.resolve();
        });
    await f.work.reconcile([entry]);
    await started.promise;
    observe({
        observedAt: new Date(1).toISOString(),
        status: 'running',
        branches: [
            {
                repository: 'owner/repo',
                branch: 'fix',
                pullRequestUrl: 'https://github.com/owner/repo/pull/1',
                pullRequest: null,
            },
        ],
    });
    await reading.promise;
    observe({ observedAt: new Date(2).toISOString(), status: 'completed' });
    expect(f.observations.map((observation) => observation.status)).toEqual(['running']);
    release.resolve();
    await f.runtime.runPromise(TestClock.adjust('0 seconds'));
    expect(f.observations.map((observation) => observation.status)).toEqual([
        'running',
        'running',
        'completed',
    ]);
    expect(f.observations[1]?.summary).toBe('GitHub evidence attached');
});
