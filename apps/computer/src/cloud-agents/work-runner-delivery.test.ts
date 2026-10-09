import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloudAgentObservation } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { createCursorCloudAgentProvider } from './cursor/provider.ts';
import {
    createRecordedCursorTransport,
    recordedAuthenticationError,
} from './cursor/recorded-transport.ts';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import type { CloudAgentProvider } from './provider.ts';
import { CloudAgentWorkSupervisor } from './work-runner.ts';

/** A Run Server recorded whose prompt this Computer never journaled. */
const orphan = {
    cancelRequested: false,
    provider: 'cursor' as const,
    providerAgentId: null,
    providerRunId: null,
    runId: 'car_orphan1234567890',
    status: 'queued' as const,
    workId: 'caw_1234567890abcdef',
};
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) {
        await close();
    }
});

async function fixture(provider: CloudAgentProvider = createFakeCloudAgentProvider()) {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-delivery-'));
    const runtime = makeTestRuntime();
    const calls: string[] = [];
    const tracked: CloudAgentProvider = {
        ...provider,
        cancel: (ref, signal) => {
            calls.push('cancel');
            return provider.cancel(ref, signal);
        },
        read: (ref, signal) => {
            calls.push('read');
            return provider.read(ref, signal);
        },
    };
    const work = new CloudAgentWorkSupervisor(runtime, {
        dataRoot,
        serverId: 'srv_cloud',
        provider: () => tracked,
        enrich: async (observation) => observation,
    });
    const observations: CloudAgentObservation[] = [];
    work.attach((observation) => observations.push(observation));
    cleanup.push(async () => {
        await work.close();
        await runtime.dispose();
        await rm(dataRoot, { recursive: true, force: true });
    });
    /** Steps virtual time in monitor ticks, letting real file IO land between them. */
    const tickUntil = async (done: () => boolean, ticks = 60) => {
        for (let tick = 0; tick < ticks && !done(); tick += 1) {
            await runtime.runPromise(TestClock.adjust('5 seconds'));
            await Bun.sleep(5);
        }
    };
    return {
        calls,
        dataRoot,
        journal: new CloudLaunchJournal(dataRoot),
        observations,
        tickUntil,
        work,
    };
}

test('a Run with no Computer record settles failed after the grace window', async () => {
    const f = await fixture();
    await f.work.reconcile([orphan]);
    expect(f.observations[0]).toMatchObject({ status: 'queued' });
    await f.tickUntil(() => f.observations.some((observation) => observation.status === 'failed'));
    expect(f.observations.at(-1)).toMatchObject({
        errorCode: 'launch-record-missing',
        runId: orphan.runId,
        status: 'failed',
    });
    expect(f.observations.at(-1)?.summary).toContain('never reached the provider');
    expect(f.observations.at(-1)?.providerRunId).toBeUndefined();
    // Settled durably: a late sender loses the exclusive claim.
    expect(await f.journal.claim('srv_cloud', orphan)).toBe(false);
    expect(f.calls).toEqual([]);
});

test('stopping a Run with no Computer record settles it cancelled at once', async () => {
    const f = await fixture();
    await f.work.reconcile([{ ...orphan, cancelRequested: true }]);
    expect(f.observations.map((observation) => observation.status)).toEqual(['cancelled']);
    expect(await f.journal.read('srv_cloud', orphan)).toEqual({
        phase: 'cancelled',
        workId: orphan.workId,
    });
    expect(f.calls).toEqual([]);
});

test('a follow-up Cursor refuses settles failed with its reason and no provider Run', async () => {
    const transport = createRecordedCursorTransport({
        reads: [],
        sendFailure: recordedAuthenticationError(),
    });
    const f = await fixture(createCursorCloudAgentProvider(transport));
    const followUp = { ...orphan, runId: 'car_followup12345678', providerAgentId: 'bc_same' };
    await f.journal.claim('srv_cloud', followUp, {
        phase: 'pending',
        workId: followUp.workId,
        providerAgentId: 'bc_same',
        instructions: 'Address the review.',
        interrupt: false,
        predecessors: [],
    });
    await f.work.reconcile([followUp]);
    await f.tickUntil(() => f.observations.some((observation) => observation.status === 'failed'));
    expect(f.observations.at(-1)).toMatchObject({
        errorCode: 'followup-delivery-rejected',
        status: 'failed',
        summary: 'The provider rejected the follow-up: Invalid API key (unauthorized)',
    });
    expect(f.observations.at(-1)?.providerRunId).toBeUndefined();
    expect(transport.requests.filter((request) => request.startsWith('send'))).toHaveLength(1);
});
