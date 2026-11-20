import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkerTurnJournal } from './turn-journal.ts';

const roots: string[] = [];
const ref = {
    provider: 'cursor' as const,
    workerId: 'caw_work',
    turnId: 'car_run',
    providerAgentId: null,
    providerRunId: null,
};
const launch = {
    environmentId: 'env_bidbeacon',
    environmentName: 'BidBeacon',
    providerAgentId: 'provider-agent',
    providerRunId: 'provider-run',
    providerUrl: null,
    startedAt: '2026-10-26T22:23:00.000Z',
    status: 'running' as const,
};

afterEach(async () => {
    for (const root of roots.splice(0)) {
        await rm(root, { recursive: true, force: true });
    }
});

test('only one concurrent caller admits a launch, and a restart keeps the admission', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    const claims = await Promise.all([journal.claim('server', ref), journal.claim('server', ref)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await new WorkerTurnJournal(root).claim('server', ref)).toBe(false);
    expect(await journal.read('server', ref)).toMatchObject({
        phase: 'launching',
        workerId: ref.workerId,
        deadlineAt: expect.any(String),
    });
});

test('a saved provider address survives restart and contains no instructions or credential', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('server', ref);
    await journal.record('server', ref, launch);
    expect(await new WorkerTurnJournal(root).read('server', ref)).toEqual({
        autoInterrupted: false,
        phase: 'launched',
        workerId: ref.workerId,
        launch,
    });
    const path = await recordPath(root);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(Object.keys(JSON.parse(await readFile(path, 'utf8')))).toEqual([
        'phase',
        'workerId',
        'launch',
        'autoInterrupted',
    ]);
});

test('definite rejection survives a lost failure report', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('server', ref);
    const rejection = { errorCode: 'provider-launch-rejected', summary: 'No repository access.' };
    await journal.reject('server', ref, rejection);
    expect(await new WorkerTurnJournal(root).read('server', ref)).toEqual({
        phase: 'rejected',
        workerId: ref.workerId,
        ...rejection,
    });
});

test('a rejection recorded before rejections carried a reason reads as a launch rejection', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('server', ref);
    await writeFile(
        await recordPath(root),
        JSON.stringify({ phase: 'rejected', workerId: ref.workerId })
    );
    expect(await journal.read('server', ref)).toEqual({
        phase: 'rejected',
        workerId: ref.workerId,
        errorCode: 'provider-launch-rejected',
        summary: null,
    });
});

test('a launch recorded before the environment pin existed reads as unpinned', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('server', ref);
    await writeFile(
        await recordPath(root),
        JSON.stringify({
            phase: 'launched',
            workerId: ref.workerId,
            launch: {
                providerAgentId: launch.providerAgentId,
                providerRunId: launch.providerRunId,
                providerUrl: launch.providerUrl,
                status: launch.status,
            },
        })
    );
    expect(await journal.read('server', ref)).toMatchObject({
        launch: { environmentId: null, environmentName: null },
    });
});

test('corrupt or mismatched records fail closed rather than admitting another launch', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('server', ref);
    await expect(journal.read('server', { ...ref, workerId: 'different' })).rejects.toThrow(
        'identity'
    );
    await writeFile(await recordPath(root), '{');
    await expect(journal.read('server', ref)).rejects.toThrow();
    expect(await journal.claim('server', ref)).toBe(false);
});

test('Server partitions cannot read each other or escape the data root', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('../server', ref);
    expect(await journal.read('server', ref)).toBeNull();
    expect(await journal.read('../server', ref)).not.toBeNull();
});

async function directory() {
    const root = await mkdtemp(join(tmpdir(), 'haus-cloud-launch-'));
    roots.push(root);
    return root;
}

async function recordPath(root: string) {
    const folder = join(root, 'cloud-agent-launches');
    const [partition] = await readdir(folder);
    if (!partition) {
        throw new Error('Missing journal partition');
    }
    const [file] = await readdir(join(folder, partition));
    if (!file) {
        throw new Error('Missing journal file');
    }
    return join(folder, partition, file);
}

test('an accepted turn is never accepted again, across a restart', async () => {
    const root = await directory();
    const sending = {
        input: 'Address the review.',
        phase: 'sending' as const,
        predecessorTurnIds: ['car_prior'],
        providerAgentId: 'bc_same',
        workerId: ref.workerId,
    };
    expect(await new WorkerTurnJournal(root).accept('server', ref, sending)).toBe(true);
    expect(await new WorkerTurnJournal(root).accept('server', ref, sending)).toBe(false);
    await new WorkerTurnJournal(root).record('server', ref, launch);
    expect(await new WorkerTurnJournal(root).accept('server', ref, sending)).toBe(false);
    expect((await new WorkerTurnJournal(root).read('server', ref))?.phase).toBe('launched');
});

test('a held follow-up becomes the Server turn when its start arrives before the drain ack', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('server', ref, heldFollowUp);
    expect(
        await journal.accept('server', ref, {
            input: 'Address the review.',
            phase: 'sending',
            predecessorTurnIds: [],
            providerAgentId: 'bc_same',
            workerId: ref.workerId,
        })
    ).toBe(true);
    await journal.forgetHeldFollowUp('server', ref.turnId);
    expect(await journal.read('server', ref)).toEqual({
        delivery: null,
        input: 'Address the review.',
        model: null,
        phase: 'sending',
        predecessorTurnIds: [],
        providerAgentId: 'bc_same',
        workerId: ref.workerId,
    });
});

test('a drain ack forgets only the held follow-up', async () => {
    const root = await directory();
    const journal = new WorkerTurnJournal(root);
    await journal.claim('server', ref, heldFollowUp);
    await journal.forgetHeldFollowUp('server', ref.turnId);
    expect(await journal.read('server', ref)).toBeNull();
    await journal.claim('server', ref);
    await journal.forgetHeldFollowUp('server', ref.turnId);
    expect((await journal.read('server', ref))?.phase).toBe('launching');
});

const heldFollowUp = {
    instructions: 'Address the review.',
    interrupt: false,
    phase: 'pending' as const,
    predecessors: [],
    providerAgentId: 'bc_same',
    workerId: ref.workerId,
};

test('a late launch cannot replace cancellation or a failed launch across journal instances', async () => {
    for (const outcome of ['cancelled', 'rejected'] as const) {
        const root = await directory();
        const journal = new WorkerTurnJournal(root);
        await journal.claim('server', ref);
        if (outcome === 'cancelled') {
            await journal.cancel('server', ref);
        } else {
            await journal.reject('server', ref, {
                errorCode: 'launch-timeout',
                summary: 'Timed out.',
            });
        }
        expect(await new WorkerTurnJournal(root).record('server', ref, launch)).toBe(false);
        expect((await journal.read('server', ref))?.phase).toBe(outcome);
    }
});
