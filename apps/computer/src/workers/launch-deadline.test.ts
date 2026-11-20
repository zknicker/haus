import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { WorkerTurnJournal } from './turn-journal.ts';
import { WorkerSupervisor } from './work-runner.ts';
import { computerServer } from './worker-supervisor.fixture.ts';

test('a launch that outlasts its deadline stops once and survives restart', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-deadline-'));
    const runtime = makeTestRuntime();
    const provider = createFakeCloudAgentProvider();
    const work = new WorkerSupervisor(runtime, {
        server: computerServer,
        dataRoot,
        serverId: 'srv_cloud',
        provider: () => provider,
    });
    const stopped = Promise.withResolvers<void>();
    const statuses: string[] = [];
    work.attach((frame) => {
        if (frame.type !== 'worker-observation') {
            return;
        }
        statuses.push(frame.observation.status);
        if (frame.observation.status === 'failed') {
            expect(frame.observation.errorCode).toBe('launch-timeout');
            stopped.resolve();
        }
    });
    const entry = {
        place: { kind: 'claude' as const },
        providerAgentId: null,
        providerRunId: null,
        status: 'queued' as const,
        stopRequested: false,
        turnId: 'car_deadline',
        workerId: 'caw_deadline',
    };
    const ref = { ...entry, provider: entry.place.kind };
    try {
        const journal = new WorkerTurnJournal(dataRoot);
        await journal.claim('srv_cloud', ref, {
            phase: 'launching',
            workerId: ref.workerId,
            deadlineAt: new Date(5 * 60_000).toISOString(),
        });
        await work.reconcile([entry]);
        expect(statuses.at(-1)).toBe('queued');
        await runtime.runPromise(TestClock.adjust('5 minutes'));
        await stopped.promise;
        const count = statuses.length;
        await runtime.runPromise(TestClock.adjust('1 hour'));
        expect(statuses).toHaveLength(count);
        expect((await new WorkerTurnJournal(dataRoot).read('srv_cloud', ref))?.phase).toBe(
            'rejected'
        );
    } finally {
        await work.close();
        await runtime.dispose();
        await rm(dataRoot, { recursive: true, force: true });
    }
});
