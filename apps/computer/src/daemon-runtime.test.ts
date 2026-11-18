import { expect, test } from 'bun:test';
import { tracePromise } from '@haus/effect';
import { Effect } from 'effect';
import { closeDaemonRuntimeResources, makeDaemonRuntime } from './daemon-runtime.ts';

test('daemon runtime executes effects and disposes idempotently', async () => {
    const runtime = makeDaemonRuntime();
    expect(runtime.runSync(Effect.succeed('ready'))).toBe('ready');
    await runtime.dispose();
    await expect(runtime.dispose()).resolves.toBeUndefined();
});

test('released daemon runtime exports through its authenticated Server relay', async () => {
    const requests: Array<{ authorization: string | null; path: string }> = [];
    const server = Bun.serve({
        fetch(request) {
            requests.push({
                authorization: request.headers.get('authorization'),
                path: new URL(request.url).pathname,
            });
            return new Response(null, { status: 200 });
        },
        port: 0,
    });
    const runtime = makeDaemonRuntime({
        telemetryRelay: {
            credential: 'computer-secret',
            serverOrigin: server.url.origin,
        },
    });
    try {
        await tracePromise(
            runtime,
            'haus.agent.turn',
            { 'haus.operation': 'agent.turn' },
            async () => undefined
        );
    } finally {
        await runtime.dispose();
        server.stop(true);
    }

    expect(requests).toContainEqual({
        authorization: 'Bearer computer-secret',
        path: '/computer/telemetry/v1/traces',
    });
    expect(requests).toContainEqual({
        authorization: 'Bearer computer-secret',
        path: '/computer/telemetry/v1/metrics',
    });
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
