import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import { CloudAgentWorkSupervisor } from './work-runner.ts';

test('a launch that outlasts its deadline stops once and survives restart', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-deadline-'));
    const runtime = makeTestRuntime();
    const provider = createFakeCloudAgentProvider();
    const work = new CloudAgentWorkSupervisor(runtime, {
        dataRoot,
        serverId: 'srv_cloud',
        provider: () => provider,
    });
    const stopped = Promise.withResolvers<void>();
    const statuses: string[] = [];
    work.attach((observation) => {
        statuses.push(observation.status);
        if (observation.status === 'failed') {
            expect(observation.errorCode).toBe('launch-timeout');
            stopped.resolve();
        }
    });
    const ref = {
        provider: 'claude' as const,
        providerAgentId: null,
        providerRunId: null,
        runId: 'car_deadline',
        workId: 'caw_deadline',
        status: 'queued' as const,
        cancelRequested: false,
    };
    try {
        const journal = new CloudLaunchJournal(dataRoot);
        await journal.claim('srv_cloud', ref, {
            phase: 'launching',
            workId: ref.workId,
            deadlineAt: new Date(5 * 60_000).toISOString(),
        });
        await work.reconcile([ref]);
        expect(statuses.at(-1)).toBe('queued');
        await runtime.runPromise(TestClock.adjust('5 minutes'));
        await stopped.promise;
        const count = statuses.length;
        await runtime.runPromise(TestClock.adjust('1 hour'));
        expect(statuses).toHaveLength(count);
        expect((await new CloudLaunchJournal(dataRoot).read('srv_cloud', ref))?.phase).toBe(
            'rejected'
        );
    } finally {
        await work.close();
        await runtime.dispose();
        await rm(dataRoot, { recursive: true, force: true });
    }
});
