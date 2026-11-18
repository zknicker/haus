import { afterEach, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import {
    compactionToolName,
    type RuntimeTokenUsage,
    type TurnEvent,
} from '../runtime/turn-event.ts';
import { observeTurnStream } from './turn-stream.ts';

let runtime = makeTestRuntime();
afterEach(async () => {
    await runtime.dispose();
    runtime = makeTestRuntime();
});

test('context tokens are the last step input, not usage summed across the turn', async () => {
    const result = await observeTurnStream(
        parts([
            { contextTokens: 100, type: 'step-finish', usage: usage(100, 20) },
            { contextTokens: 250, type: 'step-finish', usage: usage(250, 30) },
            { claudePlanUsage: null, type: 'turn-finish', usage: usage(350, 50) },
        ]),
        undefined,
        undefined,
        { runtime }
    );

    expect(result.contextTokens).toBe(250);
    expect(result.tokenUsage).toMatchObject({ inputTokens: 350, outputTokens: 50 });
});

test('a turn reports whether its runtime compacted the context', async () => {
    const finish: TurnEvent = { claudePlanUsage: null, type: 'turn-finish', usage: null };
    const tool = (toolName: string): TurnEvent[] => [
        { input: {}, providerExecuted: true, toolCallId: toolName, toolName, type: 'tool-call' },
        { output: {}, providerExecuted: true, toolCallId: toolName, toolName, type: 'tool-result' },
    ];
    const observe = (events: TurnEvent[]) =>
        observeTurnStream(parts(events), undefined, undefined, { runtime });

    expect(await observe([...tool('bash'), finish])).toMatchObject({ compacted: false });
    expect(await observe([...tool(compactionToolName), finish])).toMatchObject({
        compacted: true,
    });
});

test('a silent turn is interrupted after the no-progress deadline', async () => {
    const controller = new AbortController();
    let interrupted = 0;
    const observing = observeTurnStream(
        silentAfter([{ id: 'r1', type: 'reasoning-start' }], controller.signal),
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
            [{ input: undefined, toolCallId: 'call_a', toolName: 'bash', type: 'tool-call' }],
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

async function* parts(values: TurnEvent[]) {
    yield* values;
}

function usage(inputTokens: number, outputTokens: number): RuntimeTokenUsage {
    return {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
}

/** Emits the given parts, then goes silent until the turn is aborted, like a wedged runtime. */
async function* silentAfter(values: TurnEvent[], signal: AbortSignal) {
    yield* values;
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
}

async function settleTimers() {
    await new Promise((resolve) => setTimeout(resolve, 10));
}
