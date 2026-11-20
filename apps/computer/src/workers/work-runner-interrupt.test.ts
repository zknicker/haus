import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerObservation } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { recordedAgentBusyError } from './cursor/recorded-transport.ts';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import type { CloudAgentProvider } from './provider.ts';
import { WorkerTurnJournal } from './turn-journal.ts';
import { WorkerSupervisor } from './work-runner.ts';
import { computerServer } from './worker-supervisor.fixture.ts';

const turn = {
    attempt: null,
    place: { kind: 'cursor' as const },
    providerAgentId: null,
    providerRunId: null,
    status: 'queued' as const,
    stopRequested: false,
    turnId: 'car_orphan1234567890',
    workerId: 'caw_1234567890abcdef',
};

function sending(providerAgentId: string, workerId: string) {
    return {
        input: 'Address the review.',
        phase: 'sending' as const,
        predecessorTurnIds: [],
        providerAgentId,
        workerId,
    };
}
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) {
        await close();
    }
});

async function fixture(provider: CloudAgentProvider) {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-interrupt-'));
    const runtime = makeTestRuntime();
    const work = new WorkerSupervisor(runtime, {
        server: computerServer,
        dataRoot,
        serverId: 'srv_cloud',
        provider: () => provider,
        enrich: async (observation) => observation,
    });
    const observations: WorkerObservation[] = [];
    work.attach((frame) => {
        if (frame.type === 'worker-observation') {
            observations.push(frame.observation);
        }
    });
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
        journal: new WorkerTurnJournal(dataRoot),
        observations,
        tickUntil,
        work,
    };
}

test('a follow-up whose send keeps failing is auto-interrupted, and reports that too when it still fails', async () => {
    const followUp = { ...turn, providerAgentId: 'bc_stalled', turnId: 'car_stalledfollowup1' };
    const ref = { ...followUp, provider: followUp.place.kind };
    const alwaysBusy: CloudAgentProvider = {
        ...createFakeCloudAgentProvider(),
        send: () => Promise.reject(recordedAgentBusyError()),
    };
    const f = await fixture(alwaysBusy);
    await f.journal.claim('srv_cloud', ref, sending('bc_stalled', ref.workerId));
    await f.work.reconcile([followUp]);
    const stalled = (observation: WorkerObservation) =>
        observation.turnId === followUp.turnId &&
        observation.stallCode === 'followup-auto-interrupt-failed';
    await f.tickUntil(() => f.observations.some(stalled), 60); // past the 2-minute interrupt grace
    expect(f.observations.find(stalled)).toMatchObject({ status: 'queued' });
    expect(await f.journal.read('srv_cloud', ref)).toMatchObject({
        delivery: { interruptedAt: expect.any(String) },
        phase: 'sending',
    });
});

test('a follow-up whose send fails but then goes through once auto-interrupted records that it did', async () => {
    const followUp = { ...turn, providerAgentId: 'bc_recovers', turnId: 'car_recoversfollowup1' };
    const ref = { ...followUp, provider: followUp.place.kind };
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
                environmentId: null,
                environmentName: null,
                providerAgentId: input.providerAgentId,
                providerRunId: `run_${input.idempotencyKey}`,
                providerUrl: null,
                status: 'running' as const,
            });
        },
    };
    const f = await fixture(failsUntilInterrupted);
    await f.journal.claim('srv_cloud', ref, sending('bc_recovers', ref.workerId));
    await f.work.reconcile([followUp]);
    const delivered = (observation: WorkerObservation) =>
        observation.turnId === followUp.turnId && observation.providerRunId !== undefined;
    await f.tickUntil(() => f.observations.some(delivered), 60);
    expect(f.observations.find(delivered)?.summary).toContain('automatically interrupted');
    expect(await f.journal.read('srv_cloud', ref)).toMatchObject({
        autoInterrupted: true,
        phase: 'launched',
    });
});
