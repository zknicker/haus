import { expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { CloudAgentLaunchScope } from './launch-scope.ts';

test('daemon close drains an admitted launch and rejects new admission', async () => {
    const runtime = makeTestRuntime();
    const launches = new CloudAgentLaunchScope(runtime);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let persisted = false;
    const running = launches.run(async () => {
        started.resolve();
        await release.promise;
        persisted = true;
        return 'saved';
    });
    await started.promise;
    let closed = false;
    const closing = launches.close();
    expect(launches.close()).toBe(closing);
    void closing.then(() => {
        closed = true;
    });
    await expect(launches.run(async () => 'late')).rejects.toThrow('shutting down');
    expect(closed).toBe(false);
    release.resolve();
    await closing;
    expect(persisted).toBe(true);
    expect(await running).toBe('saved');
    await runtime.dispose();
});

test('launch persistence failure reaches the caller while shutdown joins it', async () => {
    const runtime = makeTestRuntime();
    const launches = new CloudAgentLaunchScope(runtime);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const failure = new Error('journal disk full');
    const running = launches.run(async () => {
        started.resolve();
        await release.promise;
        throw failure;
    });
    const result = running.catch((error) => error);
    await started.promise;
    const closing = launches.close();
    release.resolve();
    await closing;
    expect(await result).toBe(failure);
    await runtime.dispose();
});
