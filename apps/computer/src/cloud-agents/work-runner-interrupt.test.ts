import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloudAgentObservation } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { recordedAgentBusyError } from './cursor/recorded-transport.ts';
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

async function fixture(provider: CloudAgentProvider) {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-interrupt-'));
    const runtime = makeTestRuntime();
    const work = new CloudAgentWorkSupervisor(runtime, {
        dataRoot,
        serverId: 'srv_cloud',
        provider: () => provider,
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
        journal: new CloudLaunchJournal(dataRoot),
        observations,
        tickUntil,
        work,
    };
}

test('a follow-up whose send keeps failing is auto-interrupted, and reports that too when it still fails', async () => {
    const followUp = { ...orphan, providerAgentId: 'bc_stalled', runId: 'car_stalledfollowup1' };
    const alwaysBusy: CloudAgentProvider = {
        ...createFakeCloudAgentProvider(),
        send: () => Promise.reject(recordedAgentBusyError()),
    };
    const f = await fixture(alwaysBusy);
    await f.journal.claim('srv_cloud', followUp, {
        phase: 'pending',
        workId: followUp.workId,
        providerAgentId: 'bc_stalled',
        instructions: 'Address the review.',
        interrupt: false,
        predecessors: [],
    });
    await f.work.reconcile([followUp]);
    const stalled = (observation: CloudAgentObservation) =>
        observation.runId === followUp.runId &&
        observation.errorCode === 'followup-auto-interrupt-failed';
    await f.tickUntil(() => f.observations.some(stalled), 60); // past the 2-minute interrupt grace
    expect(f.observations.find(stalled)).toMatchObject({ status: 'queued' });
    expect(await f.journal.read('srv_cloud', followUp)).toMatchObject({
        delivery: { interruptedAt: expect.any(String) },
        phase: 'pending',
    });
});

test('a follow-up whose send fails but then goes through once auto-interrupted records that it did', async () => {
    const followUp = { ...orphan, providerAgentId: 'bc_recovers', runId: 'car_recoversfollowup1' };
    let sendAttempts = 0;
    const failsUntilInterrupted: CloudAgentProvider = {
        ...createFakeCloudAgentProvider(),
        send: (input) => {
            sendAttempts += 1;
            // Fails through every ordinary backoff retry; only the attempt
            // auto-interrupt makes right after clearing the session succeeds.
            if (sendAttempts <= 6) {
                return Promise.reject(recordedAgentBusyError());
            }
            return Promise.resolve({
                providerAgentId: input.providerAgentId,
                providerRunId: `run_${input.idempotencyKey}`,
                providerUrl: null,
                status: 'running' as const,
            });
        },
    };
    const f = await fixture(failsUntilInterrupted);
    await f.journal.claim('srv_cloud', followUp, {
        phase: 'pending',
        workId: followUp.workId,
        providerAgentId: 'bc_recovers',
        instructions: 'Address the review.',
        interrupt: false,
        predecessors: [],
    });
    await f.work.reconcile([followUp]);
    const delivered = (observation: CloudAgentObservation) =>
        observation.runId === followUp.runId && observation.providerRunId !== undefined;
    await f.tickUntil(() => f.observations.some(delivered), 60);
    expect(f.observations.find(delivered)?.summary).toContain('automatically interrupted');
    expect(await f.journal.read('srv_cloud', followUp)).toMatchObject({
        autoInterrupted: true,
        phase: 'launched',
    });
});
