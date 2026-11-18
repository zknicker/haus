import { expect, test } from 'bun:test';
import type { SDKMessage } from '@cursor/sdk';
import { streamCursorRun } from './sdk-stream.ts';

test('aborting an idle stream disposes its reader and joins iteration without cancelling work', async () => {
    const next = Promise.withResolvers<IteratorResult<SDKMessage, void>>();
    const started = Promise.withResolvers<void>();
    const disposed = Promise.withResolvers<void>();
    let closed = 0;
    let returned = 0;
    let callbacks = 0;
    const iterator: AsyncGenerator<SDKMessage, void> = {
        [Symbol.asyncIterator]() {
            return this;
        },
        next() {
            started.resolve();
            return next.promise;
        },
        return() {
            returned += 1;
            return Promise.resolve({ done: true, value: undefined });
        },
        throw(error) {
            return Promise.reject(error);
        },
        async [Symbol.asyncDispose]() {
            await this.return();
        },
    };
    const run = {
        supports: () => true,
        stream: () => iterator,
        async disposeClientStream() {
            closed += 1;
            next.resolve({ done: true, value: undefined });
            await disposed.promise;
        },
    };
    const controller = new AbortController();
    let finished = false;
    const watching = streamCursorRun(
        run,
        async () => {
            callbacks += 1;
        },
        controller.signal
    ).then(() => {
        finished = true;
    });
    await started.promise;
    controller.abort();
    await Promise.resolve();
    expect(finished).toBe(false);
    disposed.resolve();
    await watching;
    expect(closed).toBe(1);
    expect(returned).toBe(1);
    expect(callbacks).toBe(0);
});

test('an SDK handle without local disposal falls back before opening a stream', async () => {
    let opened = false;
    const run = {
        supports: () => true,
        stream() {
            opened = true;
            throw new Error('must not open');
        },
    };
    await streamCursorRun(run, async () => undefined, new AbortController().signal);
    expect(opened).toBe(false);
});
