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
import type { CloudAgentProvider, CloudAgentProviderObservation } from './provider.ts';
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

/**
 * Reproduces TECH-7: a Claude session whose foreground turn ended but that
 * kept an open background task (its own "staying subscribed to CI") reads
 * `status: 'running'` forever from `claudeRunObservation`, even though
 * `workerStatus` is `idle` and the session will happily take a new prompt.
 * Before the fix, `previousReady` waits on `isTerminalCloudAgentStatus`
 * alone, so a follow-up queued behind it never attempts delivery — no send,
 * no `delivery` bookkeeping, no deadline, no inbox attention, forever.
 */
function stuckClaudeTracked(base: CloudAgentProvider): CloudAgentProvider {
    return {
        ...base,
        // Every Run in the fixture shares one hosted Claude session: the whole
        // chain reads idle-with-an-open-background-task, exactly like the
        // production incident's predecessor and each follow-up sent after it.
        read: () =>
            Promise.resolve<CloudAgentProviderObservation>({
                observedAt: new Date().toISOString(),
                rawStatus: 'idle',
                status: 'running',
                summary: 'Staying subscribed to CI.',
            }),
    };
}

test('a follow-up stuck behind a Claude predecessor that is idle with open background tasks is delivered, not left silent', async () => {
    const stuckPredecessor = {
        provider: 'claude' as const,
        providerAgentId: 'cse_stuck',
        providerRunId: 'r_predecessor',
        runId: 'car_predecessor123456',
        workId: 'caw_stuck1234567890',
    };
    const followUp = {
        ...stuckPredecessor,
        providerRunId: null,
        runId: 'car_followup1234567',
    };
    const f = await fixture(stuckClaudeTracked(createFakeCloudAgentProvider()));
    await f.journal.claim('srv_cloud', followUp, {
        phase: 'pending',
        workId: followUp.workId,
        providerAgentId: 'cse_stuck',
        instructions: 'Address the review.',
        interrupt: false,
        predecessors: [stuckPredecessor],
    });
    await f.work.reconcile([{ ...followUp, cancelRequested: false, status: 'queued' as const }]);
    const delivered = (observation: CloudAgentObservation) =>
        observation.runId === followUp.runId && observation.providerRunId !== undefined;
    await f.tickUntil(
        () => f.observations.some(delivered),
        // Longer than the 30-minute delivery deadline (5s ticks): a timeout here would
        // also prove delivery eventually settles, but the fixed behavior is immediate.
        400
    );
    expect(f.observations.some(delivered)).toBe(true);
    expect(await f.journal.read('srv_cloud', followUp)).toMatchObject({ phase: 'launched' });
});

test('a follow-up waiting on a genuinely busy predecessor reports why, instead of staying silent', async () => {
    const busyPredecessor = {
        provider: 'cursor' as const,
        providerAgentId: 'bc_busy',
        providerRunId: 'r_busy',
        runId: 'car_busypredecessor12',
        workId: 'caw_busy1234567890',
    };
    const followUp = { ...busyPredecessor, providerRunId: null, runId: 'car_busyfollowup1234' };
    const busyTracked: CloudAgentProvider = {
        ...createFakeCloudAgentProvider(),
        read: () =>
            Promise.resolve<CloudAgentProviderObservation>({
                observedAt: new Date().toISOString(),
                rawStatus: 'RUNNING',
                status: 'running',
            }),
    };
    const f = await fixture(busyTracked);
    await f.journal.claim('srv_cloud', followUp, {
        phase: 'pending',
        workId: followUp.workId,
        providerAgentId: 'bc_busy',
        instructions: 'Address the review.',
        interrupt: false,
        predecessors: [busyPredecessor],
    });
    await f.work.reconcile([{ ...followUp, cancelRequested: false, status: 'queued' as const }]);
    await f.tickUntil(() =>
        f.observations.some((observation) => observation.runId === followUp.runId)
    );
    expect(
        f.observations.find((observation) => observation.runId === followUp.runId)
    ).toMatchObject({
        activity: {
            summary: 'Waiting for an earlier Run to finish before sending this follow-up.',
        },
        status: 'queued',
    });
    // Still genuinely unbounded while the predecessor keeps reporting running: unchanged contract.
    await f.tickUntil(() => false, 20);
    expect(await f.journal.read('srv_cloud', followUp)).toMatchObject({ phase: 'pending' });
});

test('several follow-ups queued behind the same stuck predecessor each settle in order', async () => {
    const stuckPredecessor = {
        provider: 'claude' as const,
        providerAgentId: 'cse_stuck',
        providerRunId: 'r_predecessor',
        runId: 'car_predecessor654321',
        workId: 'caw_stuck0987654321',
    };
    const followUp1 = { ...stuckPredecessor, providerRunId: null, runId: 'car_followup_a' };
    const followUp2 = { ...stuckPredecessor, providerRunId: null, runId: 'car_followup_b' };
    const f = await fixture(stuckClaudeTracked(createFakeCloudAgentProvider()));
    await f.journal.claim('srv_cloud', followUp1, {
        phase: 'pending',
        workId: followUp1.workId,
        providerAgentId: 'cse_stuck',
        instructions: 'First correction.',
        interrupt: false,
        predecessors: [stuckPredecessor],
    });
    await f.journal.claim('srv_cloud', followUp2, {
        phase: 'pending',
        workId: followUp2.workId,
        providerAgentId: 'cse_stuck',
        instructions: 'Second correction.',
        interrupt: false,
        predecessors: [stuckPredecessor, followUp1],
    });
    await f.work.reconcile([
        { ...followUp1, cancelRequested: false, status: 'queued' as const },
        { ...followUp2, cancelRequested: false, status: 'queued' as const },
    ]);
    await f.tickUntil(
        () =>
            f.observations.some(
                (observation) =>
                    observation.runId === followUp2.runId && observation.providerRunId !== undefined
            ),
        400
    );
    expect(await f.journal.read('srv_cloud', followUp1)).toMatchObject({ phase: 'launched' });
    expect(await f.journal.read('srv_cloud', followUp2)).toMatchObject({ phase: 'launched' });
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
