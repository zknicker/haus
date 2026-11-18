import { expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import * as Cause from 'effect/Cause';
import * as Option from 'effect/Option';
import * as Runtime from 'effect/Runtime';
import { loadRemoteIcon } from './icon-loader.ts';
import { makeMcpIconResolver } from './icons.ts';

test('interrupts a timed-out request and cancels its response reader', async () => {
    const runtime = makeTestRuntime();
    const resolveIcon = makeMcpIconResolver(runtime);
    const fetchStarted = Promise.withResolvers<void>();
    const cleanup: string[] = [];
    let aborted = false;
    let cancelled = false;
    let requests = 0;
    const body = new ReadableStream<Uint8Array>({
        cancel() {
            cancelled = true;
            cleanup.push('cancel');
        },
    });
    const resolving = resolveIcon({
        connectionUrl: 'https://mcp.example.com/mcp',
        fetchImpl: (_url, signal) => {
            requests += 1;
            if (requests > 1) {
                return Promise.reject(new Error('no favicon'));
            }
            signal.addEventListener('abort', () => {
                aborted = true;
                cleanup.push('abort');
            });
            fetchStarted.resolve();
            return Promise.resolve(
                new Response(body, {
                    headers: { 'content-type': 'image/png' },
                    status: 200,
                })
            );
        },
        serverInfoIcons: [{ src: 'https://mcp.example.com/icon.png' }],
        timeoutMs: 50,
    });

    try {
        await fetchStarted.promise;
        await runtime.runPromise(TestClock.adjust('50 millis'));
        await expect(resolving).resolves.toBeNull();
        expect(aborted).toBe(true);
        expect(cancelled).toBe(true);
        expect(cleanup).toEqual(['abort', 'cancel']);
    } finally {
        await runtime.dispose();
    }
});

test('logs only a closed safe classification for a recoverable icon IO failure', async () => {
    const warnings: Array<readonly unknown[]> = [];
    const hostile = Object.assign(new Error('secret foreign message'), {
        _tag: 'secret foreign tag',
        name: 'secret foreign name',
    });
    const runtime = makeTestRuntime({
        output: {
            debug: ignore,
            error: ignore,
            info: ignore,
            log: ignore,
            trace: ignore,
            warn: (...values) => warnings.push(values),
        },
    });
    try {
        await expect(
            loadRemoteIcon(runtime, {
                encode: () => null,
                fetchImpl: async () => Promise.reject(hostile),
                timeoutMs: 50,
                url: 'https://mcp.example.com/icon.png',
            })
        ).resolves.toBeNull();
        expect(warnings).toEqual([
            [
                'MCP icon request failed; skipping icon.',
                { failureKind: 'error', operation: 'mcp.icon.fetch' },
            ],
        ]);
        expect(JSON.stringify(warnings)).not.toContain('secret foreign');
    } finally {
        await runtime.dispose();
    }
});

test('preserves an icon encoding defect at the lifecycle settlement seam', async () => {
    const runtime = makeTestRuntime();
    const defect = new Error('encoding defect');
    try {
        const rejection = await loadRemoteIcon(runtime, {
            encode: () => {
                throw defect;
            },
            fetchImpl: async () =>
                new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]) as unknown as BodyInit, {
                    headers: { 'content-type': 'image/png' },
                    status: 200,
                }),
            timeoutMs: 50,
            url: 'https://mcp.example.com/icon.png',
        }).catch((cause) => cause);

        expect(Runtime.isFiberFailure(rejection)).toBe(true);
        if (!Runtime.isFiberFailure(rejection)) {
            throw new Error('Expected an Effect FiberFailure.');
        }
        const retainedDefect = Cause.dieOption(rejection[Runtime.FiberFailureCauseId]);
        expect(Option.isSome(retainedDefect) ? retainedDefect.value : null).toBe(defect);
    } finally {
        await runtime.dispose();
    }
});

function ignore(..._values: readonly unknown[]) {}
