import { expect, test } from 'bun:test';
import { makeTestRuntime, settle } from '@haus/effect';
import { Effect, Exit, Scope } from 'effect';
import { ObservationReports } from './observation-reports.ts';

test('burst progress stays bounded while terminal evidence is preserved', async () => {
    const runtime = makeTestRuntime();
    const scope = runtime.runSync(Scope.make());
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const terminal = Promise.withResolvers<void>();
    const statuses: string[] = [];
    const reports = new ObservationReports(
        runtime,
        async (observation) => {
            started.resolve();
            await release.promise;
            return observation;
        },
        (observation) => {
            statuses.push(observation.status);
            if (observation.status === 'completed') {
                terminal.resolve();
            }
        }
    );
    runtime.runSync(Effect.forkIn(reports.consume(), scope));
    reports.enqueue({ observedAt: new Date(0).toISOString(), status: 'running' });
    await started.promise;
    for (let index = 1; index <= 100; index += 1) {
        reports.enqueue({ observedAt: new Date(index).toISOString(), status: 'running' });
    }
    reports.enqueue({ observedAt: new Date(101).toISOString(), status: 'completed' });
    reports.enqueue({ observedAt: new Date(102).toISOString(), status: 'failed' });
    release.resolve();
    await terminal.promise;
    expect(statuses.length).toBeLessThanOrEqual(33);
    expect(statuses.at(-1)).toBe('completed');
    await settle(runtime, Scope.close(scope, Exit.void));
    await runtime.dispose();
});

test('a failing observation sink releases the waiting publisher', async () => {
    const runtime = makeTestRuntime();
    const scope = runtime.runSync(Scope.make());
    const reports = new ObservationReports(
        runtime,
        async (observation) => observation,
        () => {
            throw new Error('socket closed');
        }
    );
    runtime.runSync(Effect.forkIn(reports.consume(), scope));
    await expect(
        settle(
            runtime,
            reports.publish({ observedAt: new Date(0).toISOString(), status: 'completed' })
        )
    ).rejects.toThrow();
    await settle(runtime, Scope.close(scope, Exit.void));
    await runtime.dispose();
});
