import { expect, test } from 'bun:test';
import { readGrokRequestUsage, readGrokTurnUsage } from './grok-usage.ts';

// The cases of harness/grok-token-usage.test.ts, which proved the AI SDK path, on the driver.
test('reads Grok turn usage from the prompt response _meta.usage', () => {
    expect(
        readGrokTurnUsage({
            _meta: {
                inputTokens: 999,
                outputTokens: 999,
                totalTokens: 1998,
                usage: {
                    cacheCreationTokens: 0,
                    cachedReadTokens: 173_184,
                    inputTokens: 206_543,
                    outputTokens: 3746,
                    reasoningTokens: 2201,
                    totalTokens: 210_289,
                },
            },
            stopReason: 'end_turn',
        })
    ).toEqual({
        cacheReadTokens: 173_184,
        cacheWriteTokens: 0,
        inputTokens: 206_543,
        outputTokens: 3746,
        totalTokens: 210_289,
    });
});

test('sibling token fields repeat the last model call and are never usage', () => {
    expect(
        readGrokTurnUsage({
            _meta: { inputTokens: 999, outputTokens: 999, totalTokens: 1998 },
            stopReason: 'end_turn',
        })
    ).toBeNull();
});

test('a malformed total is no usage, not a partial one', () => {
    expect(
        readGrokTurnUsage({
            _meta: { usage: { inputTokens: -1, outputTokens: 20, totalTokens: 120 } },
        })
    ).toBeNull();
});

test('standard ACP usage outranks Grok _meta.usage', () => {
    expect(
        readGrokTurnUsage({
            _meta: { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 } },
            usage: {
                cachedReadTokens: 2,
                cachedWriteTokens: 3,
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15,
            },
        })
    ).toEqual({
        cacheReadTokens: 2,
        cacheWriteTokens: 3,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
    });
});

test("a request's context is its whole input, cached tokens included", () => {
    expect(
        readGrokRequestUsage({
            cache_creation_input_tokens: 4,
            cache_read_input_tokens: 10_752,
            input_tokens: 283,
            output_tokens: 158,
            reasoning_tokens: 157,
        })
    ).toEqual({
        contextTokens: 11_039,
        usage: {
            cacheReadTokens: 10_752,
            cacheWriteTokens: 4,
            inputTokens: 11_039,
            outputTokens: 158,
            totalTokens: 11_197,
        },
    });
    expect(readGrokRequestUsage({ input_tokens: 'many' })).toBeNull();
});
