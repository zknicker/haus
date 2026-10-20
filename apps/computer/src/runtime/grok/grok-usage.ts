import * as z from 'zod';
import type { RuntimeTokenUsage } from '../turn-event.ts';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Standard ACP `PromptResponse.usage`. */
const acpUsageSchema = z.looseObject({
    cachedReadTokens: count.nullish(),
    cachedWriteTokens: count.nullish(),
    inputTokens: count,
    outputTokens: count,
    totalTokens: count,
});

/** Grok's own turn total on the prompt response `_meta.usage` (and `turn_completed`). */
const grokTurnUsageSchema = z.looseObject({
    cacheCreationTokens: count.nullish(),
    cachedReadTokens: count.nullish(),
    inputTokens: count,
    outputTokens: count,
    reasoningTokens: count.nullish(),
    totalTokens: count,
});

/** One model request's usage on `response_completed`; `input_tokens` excludes cached input. */
const grokRequestUsageSchema = z.looseObject({
    cache_creation_input_tokens: count.nullish(),
    cache_read_input_tokens: count.nullish(),
    input_tokens: count,
    output_tokens: count,
});

/**
 * The turn's billable usage from a prompt response: standard ACP `usage` first, then Grok's
 * `_meta.usage`. Grok's `inputTokens` already includes cached input. Sibling token fields
 * directly on `_meta` repeat the last model call, so they are never read. A malformed total is
 * no usage, not a partial one.
 */
export function readGrokTurnUsage(response: unknown): RuntimeTokenUsage | null {
    const record = asRecord(response);
    const standard = acpUsageSchema.safeParse(record?.usage);
    if (standard.success) {
        return usage({
            cacheRead: standard.data.cachedReadTokens ?? 0,
            cacheWrite: standard.data.cachedWriteTokens ?? 0,
            input: standard.data.inputTokens,
            output: standard.data.outputTokens,
        });
    }
    const grok = grokTurnUsageSchema.safeParse(asRecord(record?._meta)?.usage);
    if (!grok.success) {
        return null;
    }
    return usage({
        cacheRead: grok.data.cachedReadTokens ?? 0,
        cacheWrite: grok.data.cacheCreationTokens ?? 0,
        input: grok.data.inputTokens,
        output: grok.data.outputTokens,
    });
}

/** One request's usage and context size (its whole input, cached tokens included). */
export function readGrokRequestUsage(
    value: unknown
): { contextTokens: number; usage: RuntimeTokenUsage } | null {
    const parsed = grokRequestUsageSchema.safeParse(value);
    if (!parsed.success) {
        return null;
    }
    const cacheRead = parsed.data.cache_read_input_tokens ?? 0;
    const cacheWrite = parsed.data.cache_creation_input_tokens ?? 0;
    const input = parsed.data.input_tokens + cacheRead + cacheWrite;
    return {
        contextTokens: input,
        usage: usage({ cacheRead, cacheWrite, input, output: parsed.data.output_tokens }),
    };
}

function usage(counts: {
    cacheRead: number;
    cacheWrite: number;
    input: number;
    output: number;
}): RuntimeTokenUsage {
    return {
        cacheReadTokens: counts.cacheRead,
        cacheWriteTokens: counts.cacheWrite,
        inputTokens: counts.input,
        outputTokens: counts.output,
        totalTokens: counts.input + counts.output,
    };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
