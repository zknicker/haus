import { expect, test } from 'bun:test';
import { Effect } from 'effect';
import { closeDaemonRuntimeResources, makeDaemonRuntime } from './daemon-runtime.ts';

test('daemon runtime executes effects and disposes idempotently', async () => {
    const runtime = makeDaemonRuntime();
    expect(runtime.runSync(Effect.succeed('ready'))).toBe('ready');
    await runtime.dispose();
    await expect(runtime.dispose()).resolves.toBeUndefined();
});

test('runtime disposal still runs when coordination shutdown fails', async () => {
    const coordinationFailure = new Error('coordination failed');
    const calls: string[] = [];

    await expect(
        closeDaemonRuntimeResources(
            async () => {
                calls.push('coordination');
                throw coordinationFailure;
            },
            async () => {
                calls.push('runtime');
            }
        )
    ).rejects.toBe(coordinationFailure);
    expect(calls).toEqual(['coordination', 'runtime']);
});

test('daemon shutdown preserves both cleanup failures', async () => {
    const coordinationFailure = new Error('coordination failed');
    const runtimeFailure = new Error('runtime failed');

    try {
        await closeDaemonRuntimeResources(
            async () => {
                throw coordinationFailure;
            },
            async () => {
                throw runtimeFailure;
            }
        );
        throw new Error('Expected daemon shutdown to fail.');
    } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toEqual([coordinationFailure, runtimeFailure]);
    }
});
