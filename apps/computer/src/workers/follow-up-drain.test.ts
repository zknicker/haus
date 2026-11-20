import { expect, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import type { WorkerComputerFrame } from './turn-monitor.ts';
import {
    reconcileEntry,
    registerSupervisorFixture,
    serverId,
    turnRef,
    turnStartFrame,
} from './worker-supervisor.fixture.ts';

const supervisors = registerSupervisorFixture();
const frame = turnStartFrame({
    input: 'Address the review comments.',
    providerAgentId: 'bc_same',
    turnId: 'car_heldfollowup1234',
});
const held = {
    instructions: 'Address the review comments.',
    interrupt: false,
    phase: 'pending' as const,
    predecessors: [
        {
            provider: 'cursor' as const,
            providerAgentId: 'bc_same',
            providerRunId: 'run_prior',
            turnId: 'car_prior1234567890',
            workerId: frame.workerId,
        },
    ],
    providerAgentId: 'bc_same',
    workerId: frame.workerId,
};
const drain = {
    instructions: 'Address the review comments.',
    predecessorTurnIds: ['car_prior1234567890'],
    providerAgentId: 'bc_same',
    providerRunId: null,
    turnId: 'car_heldfollowup1234',
    type: 'worker-follow-up-drain' as const,
    workerId: frame.workerId,
};
const drains = (frames: WorkerComputerFrame[]) =>
    frames.filter((sent) => sent.type === 'worker-follow-up-drain');

test('a held follow-up goes to the Server once per connection and leaves only after its ack', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    await f.journal.claim(serverId, turnRef(frame), held);
    const first = f.start();
    await first.work.reconcile([reconcileEntry(frame)]);
    await first.work.reconcile([reconcileEntry(frame)]);
    expect(drains(first.frames)).toEqual([drain]);
    await first.work.close();
    expect((await f.journal.read(serverId, turnRef(frame)))?.phase).toBe('pending');

    const reconnected = f.start();
    await reconnected.work.reconcile([reconcileEntry(frame)]);
    expect(drains(reconnected.frames)).toEqual([drain]);
    await reconnected.work.forgetDrainedFollowUp(frame.turnId);
    expect(await f.journal.read(serverId, turnRef(frame))).toBeNull();
    expect(f.provider.sends).toEqual([]);
});

test('a start that arrives before the drain ack takes the held follow-up over and sends it once', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    await f.journal.claim(serverId, turnRef(frame), held);
    const daemon = f.start();
    await daemon.work.accept(frame);
    await daemon.work.reconcile([reconcileEntry(frame)]);
    await daemon.work.forgetDrainedFollowUp(frame.turnId);
    expect(f.provider.sends.map((send) => send.instructions)).toEqual([
        'Address the review comments.',
    ]);
    expect((await f.journal.read(serverId, turnRef(frame)))?.phase).toBe('launched');
    expect(drains(daemon.frames)).toEqual([]);
});

test('a stop for a held follow-up cancels it here and drains nothing', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    await f.journal.claim(serverId, turnRef(frame), held);
    const daemon = f.start();
    await daemon.work.reconcile([reconcileEntry(frame, true)]);
    expect(drains(daemon.frames)).toEqual([]);
    expect(daemon.observations().map((observation) => observation.status)).toEqual(['cancelled']);
    expect(f.provider.sends).toEqual([]);
});
