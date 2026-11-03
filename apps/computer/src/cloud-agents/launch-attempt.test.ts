import { expect, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { abortCloudAgentLaunch, launchCloudAgent } from './launch-attempt.ts';
import type { CloudAgentLaunch } from './provider.ts';

test('stopping an in-flight launch aborts provisioning and cancels a late provider acknowledgement', async () => {
    const provider = createFakeCloudAgentProvider();
    const pending = Promise.withResolvers<CloudAgentLaunch>();
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
    const attempt = launchCloudAgent(provider, {
        idempotencyKey: 'car_abort',
        instructions: 'Read only.',
        model: null,
        ref: null,
        repository: 'haus/haus',
        title: 'Probe',
        workId: 'caw_abort',
    });
    const stopped = attempt.catch((error: unknown) => error);
    abortCloudAgentLaunch('car_abort');
    expect(signal?.aborted).toBe(true);
    pending.resolve({
        providerAgentId: 'late_agent',
        providerRunId: 'late_run',
        providerUrl: null,
        status: 'running',
    });
    expect(await stopped).toBeInstanceOf(DOMException);
    expect(await cancelled.promise).toBe('late_agent');
});
