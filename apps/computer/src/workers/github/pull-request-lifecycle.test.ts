import { afterAll, expect, test } from 'bun:test';
import { makeTestRuntime, settle } from '@haus/effect';
import { Effect, TestClock } from 'effect';
import { createPullRequestReader } from './pull-request-reader.ts';

const runtime = makeTestRuntime();
const url = 'https://github.com/haus/haus/pull/56';
afterAll(() => runtime.dispose());

test('one total deadline bounds credential discovery and both GitHub attempts', async () => {
    const tokenStarted = Promise.withResolvers<void>();
    const retryStarted = Promise.withResolvers<void>();
    let attempts = 0;
    let aborted = false;
    const reader = createPullRequestReader({
        runtime,
        token: (signal) => {
            tokenStarted.resolve();
            return settle(runtime, Effect.sleep('3 seconds').pipe(Effect.as(null)), { signal });
        },
        fetch: (_, options) => {
            attempts += 1;
            if (attempts === 1) {
                return Promise.resolve(new Response('', { status: 502 }));
            }
            retryStarted.resolve();
            return new Promise<Response>((_, reject) => {
                options?.signal?.addEventListener(
                    'abort',
                    () => {
                        aborted = true;
                        reject(new Error('cancelled'));
                    },
                    { once: true }
                );
            });
        },
    });
    const reading = reader.read(url);
    await tokenStarted.promise;
    await runtime.runPromise(TestClock.adjust('3 seconds'));
    await retryStarted.promise;
    await runtime.runPromise(TestClock.adjust('1 second'));
    expect(await reading).toBeNull();
    expect(attempts).toBe(2);
    expect(aborted).toBe(true);
});

test('daemon cancellation joins the request and leaves no negative cache entry', async () => {
    const started = Promise.withResolvers<void>();
    let calls = 0;
    let aborted = false;
    const reader = createPullRequestReader({
        runtime,
        token: () => Promise.resolve(null),
        fetch: (_, options) => {
            calls += 1;
            if (calls > 1) {
                return Promise.resolve(
                    Response.json({
                        additions: 1,
                        changed_files: 1,
                        deletions: 0,
                        draft: false,
                        merged: false,
                        number: 56,
                        state: 'open',
                    })
                );
            }
            started.resolve();
            return new Promise<Response>((_, reject) => {
                options?.signal?.addEventListener(
                    'abort',
                    () => {
                        aborted = true;
                        reject(new Error('cancelled'));
                    },
                    { once: true }
                );
            });
        },
    });
    const controller = new AbortController();
    const reading = reader.read(url, controller.signal).catch((error: unknown) => error);
    await started.promise;
    controller.abort();
    expect(await reading).toBeInstanceOf(Error);
    expect(aborted).toBe(true);
    expect((await reader.read(url))?.number).toBe(56);
    expect(calls).toBe(2);
});
