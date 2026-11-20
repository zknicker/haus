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
const accepted = { turnId: 'wkt_1234567890abcdef', type: 'worker-turn-accepted' } as const;
const launched = (frame: WorkerComputerFrame) =>
    frame.type === 'worker-observation' && frame.observation.providerRunId !== undefined;

test('a first turn is journaled and acknowledged before the provider launches it', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    const frame = turnStartFrame();
    const seenAtLaunch: unknown[] = [];
    const launch = f.provider.start;
    f.provider.start = async (input, signal) => {
        seenAtLaunch.push((await f.journal.read(serverId, turnRef(frame)))?.phase);
        seenAtLaunch.push(daemon.frames[0]?.type);
        return await launch(input, signal);
    };
    const daemon = f.start();
    await daemon.work.accept(frame);
    await daemon.sent(launched);
    expect(seenAtLaunch).toEqual(['launching', 'worker-turn-accepted']);
    expect(daemon.frames[0]).toEqual(accepted);
    expect(f.provider.launches).toEqual([
        {
            idempotencyKey: frame.turnId,
            instructions: 'Fix the flaky delivery test.',
            model: null,
            ref: 'main',
            repository: 'haus/haus',
            title: 'Fix the flaky delivery test',
            workerId: frame.workerId,
        },
    ]);
    expect(daemon.observations().find((observation) => observation.providerRunId)).toMatchObject({
        providerAgentId: `bc_${frame.turnId}`,
        providerRunId: `run_${frame.turnId}`,
        status: 'running',
        turnId: frame.turnId,
    });
});

test('a start sent again after a restart is acknowledged again and never launches twice', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    const frame = turnStartFrame();
    const before = f.start();
    await before.work.accept(frame);
    await before.sent(launched);
    await before.work.close();
    const after = f.start();
    await after.work.accept(frame);
    await after.work.close();
    expect(after.frames[0]).toEqual(accepted);
    expect(f.provider.launches).toHaveLength(1);
    expect((await f.journal.read(serverId, turnRef(frame)))?.phase).toBe('launched');
});

test('a later turn is sent to the same hosted agent once, however often its start arrives', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    const frame = turnStartFrame({
        input: 'Address the review comments.',
        providerAgentId: 'bc_same',
        turnId: 'wkt_followup12345678',
    });
    const daemon = f.start();
    await daemon.work.accept(frame);
    await daemon.work.accept(frame);
    await daemon.work.reconcile([reconcileEntry(frame)]);
    expect(daemon.frames.filter((sent) => sent.type === 'worker-turn-accepted')).toEqual([
        { turnId: frame.turnId, type: 'worker-turn-accepted' },
        { turnId: frame.turnId, type: 'worker-turn-accepted' },
    ]);
    expect(f.provider.sends).toEqual([
        {
            idempotencyKey: frame.turnId,
            instructions: 'Address the review comments.',
            model: null,
            providerAgentId: 'bc_same',
            workerId: frame.workerId,
        },
    ]);
    expect(f.provider.launches).toEqual([]);
});

test('a later turn waits while the turn before it still runs at the provider', async () => {
    const provider = createFakeCloudAgentProvider();
    provider.read = async () => ({ observedAt: new Date(0).toISOString(), status: 'running' });
    const f = await supervisors(provider);
    const prior = turnStartFrame({ providerAgentId: 'bc_same', turnId: 'wkt_prior1234567890' });
    await f.journal.claim(serverId, turnRef(prior));
    await f.journal.record(serverId, turnRef(prior), {
        environmentId: null,
        environmentName: null,
        providerAgentId: 'bc_same',
        providerRunId: 'run_prior',
        providerUrl: null,
        status: 'running',
    });
    const next = turnStartFrame({
        providerAgentId: 'bc_same',
        predecessorTurnIds: [prior.turnId],
        turnId: 'wkt_next123456789012',
    });
    const daemon = f.start();
    await daemon.work.accept(next);
    await daemon.work.reconcile([reconcileEntry(next)]);
    expect(provider.sends).toEqual([]);
    expect(daemon.observations().at(-1)).toMatchObject({
        activity: {
            summary: 'Waiting for the earlier turn to finish before sending this follow-up.',
        },
        status: 'queued',
        turnId: next.turnId,
    });
    expect((await f.journal.read(serverId, turnRef(next)))?.phase).toBe('sending');
});

test('a stop for a turn never accepted here settles it cancelled, and its late start never runs', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    const frame = turnStartFrame();
    const daemon = f.start();
    await daemon.work.reconcile([reconcileEntry(frame, true)]);
    await daemon.work.accept(frame);
    await daemon.work.close();
    const statuses = daemon.observations().map((observation) => observation.status);
    expect(new Set(statuses)).toEqual(new Set(['cancelled']));
    expect(daemon.frames.at(-1)).toEqual(accepted);
    expect(f.provider.launches).toEqual([]);
});

test('a reconciled turn never journaled here fails as never journaled, and its late start never runs', async () => {
    const f = await supervisors(createFakeCloudAgentProvider());
    const frame = turnStartFrame();
    const daemon = f.start();
    await daemon.work.reconcile([reconcileEntry(frame)]);
    await daemon.work.accept(frame);
    await daemon.work.close();
    expect(
        daemon.observations().map(({ errorCode, status, turnId }) => ({ errorCode, status, turnId }))
    ).toEqual([{ errorCode: 'turn-not-journaled', status: 'failed', turnId: frame.turnId }]);
    expect((await f.journal.read(serverId, turnRef(frame)))?.phase).toBe('rejected');
    expect(f.provider.launches).toEqual([]);
});
