import { afterEach, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { observeTurnStream } from './turn-stream.ts';

let runtime = makeTestRuntime();
afterEach(async () => {
    await runtime.dispose();
    runtime = makeTestRuntime();
});

test('context tokens are the last step input, not usage summed across the turn', async () => {
    const result = await observeTurnStream(
        parts([
            { type: 'finish-step', usage: { inputTokens: 100, outputTokens: 20 } },
            { type: 'finish-step', usage: { inputTokens: 250, outputTokens: 30 } },
            { totalUsage: { inputTokens: 350, outputTokens: 50 }, type: 'finish' },
        ]),
        undefined,
        undefined,
        { runtime }
    );

    expect(result.contextTokens).toBe(250);
    expect(result.tokenUsage).toMatchObject({ inputTokens: 350, outputTokens: 50 });
});

test('a silent turn is interrupted after the no-progress deadline', async () => {
    const controller = new AbortController();
    let interrupted = 0;
    const observing = observeTurnStream(
        silentAfter([{ type: 'reasoning-start' }], controller.signal),
        undefined,
        undefined,
        {
            onNoProgress: () => {
                interrupted += 1;
                controller.abort();
            },
            runtime,
            signal: controller.signal,
        }
    );
    await settleTimers();

    await runtime.runPromise(TestClock.adjust('14 minutes'));
    expect(interrupted).toBe(0);
    await runtime.runPromise(TestClock.adjust('2 minutes'));

    expect(await observing).toMatchObject({ aborted: true });
    expect(interrupted).toBe(1);
});

test('an in-flight tool call holds off the no-progress deadline', async () => {
    const controller = new AbortController();
    let interrupted = false;
    const observing = observeTurnStream(
        silentAfter(
            [{ toolCallId: 'call_a', toolName: 'bash', type: 'tool-call' }],
            controller.signal
        ),
        undefined,
        undefined,
        {
            onNoProgress: () => {
                interrupted = true;
            },
            runtime,
            signal: controller.signal,
        }
    );
    await settleTimers();

    await runtime.runPromise(TestClock.adjust('60 minutes'));
    expect(interrupted).toBe(false);
    controller.abort();
    expect(await observing).toMatchObject({ aborted: true });
});

async function* parts(values: unknown[]) {
    yield* values;
}

/** Emits the given parts, then goes silent until the turn is aborted, like a wedged runtime. */
async function* silentAfter(values: unknown[], signal: AbortSignal) {
    yield* values;
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
}

async function settleTimers() {
    await new Promise((resolve) => setTimeout(resolve, 10));
}
