import { expect, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { abortWorkerLaunch, launchWorker } from './launch-attempt.ts';
import type { WorkerLaunch } from './provider.ts';

test('stopping an in-flight launch aborts provisioning and cancels a late provider acknowledgement', async () => {
    const provider = createFakeCloudAgentProvider();
    const pending = Promise.withResolvers<WorkerLaunch>();
    let signal: AbortSignal | undefined;
    provider.start = (_input, lifetime) => {
        signal = lifetime;
        return pending.promise;
    };
    const cancelled = Promise.withResolvers<string | null>();
    provider.cancel = (ref) => {
        cancelled.resolve(ref.providerAgentId);
        return Promise.resolve();
    };
    const attempt = launchWorker(provider, {
        idempotencyKey: 'car_abort',
        instructions: 'Read only.',
        model: null,
        ref: null,
        repository: 'haus/haus',
        title: 'Probe',
        workId: 'caw_abort',
    });
    const stopped = attempt.catch((error: unknown) => error);
    abortWorkerLaunch('car_abort');
    expect(signal?.aborted).toBe(true);
    pending.resolve({
        environmentId: null,
        environmentName: null,
        providerAgentId: 'late_agent',
        providerRunId: 'late_run',
        providerUrl: null,
        status: 'running',
    });
    expect(await stopped).toBeInstanceOf(DOMException);
    expect(await cancelled.promise).toBe('late_agent');
});
