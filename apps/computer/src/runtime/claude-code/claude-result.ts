import type { RuntimeTokenUsage, TurnEvent } from '../turn-event.ts';
import { ClaudeProviderLimitError, ClaudeTurnError } from './claude-errors.ts';
import type { ClaudeResult, ClaudeUsage } from './claude-messages.ts';

/** Claude usage as Haus token usage: input counts cached tokens, as the harness reported it. */
export function claudeTokenUsage(usage: ClaudeUsage | null | undefined): RuntimeTokenUsage | null {
    if (!usage) {
        return null;
    }
    const fresh = usage.input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const inputTokens = fresh + cacheReadTokens + cacheWriteTokens;
    return {
        cacheReadTokens,
        cacheWriteTokens,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
}

export function addUsage(
    current: RuntimeTokenUsage | null,
    next: RuntimeTokenUsage | null
): RuntimeTokenUsage | null {
    if (!(current && next)) {
        return next ?? current;
    }
    return {
        cacheReadTokens: current.cacheReadTokens + next.cacheReadTokens,
        cacheWriteTokens: current.cacheWriteTokens + next.cacheWriteTokens,
        inputTokens: current.inputTokens + next.inputTokens,
        outputTokens: current.outputTokens + next.outputTokens,
        totalTokens: current.totalTokens + next.totalTokens,
    };
}

export type ClaudeResultOutcome =
    | { readonly error: Error; readonly kind: 'failed' }
    | { readonly kind: 'reported' }
    | { readonly kind: 'success' };

/**
 * Raft's result classification (`claudeEventNormalizer.ts`): an error result fails the turn
 * unless the turn already reported the same API error from its assistant message; a
 * `max_tokens` stop on a success is not a failure.
 */
export function classifyResult(
    result: ClaudeResult,
    turn: { apiErrorReported: boolean; observedError?: string }
): ClaudeResultOutcome {
    const failed = (fallback: string): ClaudeResultOutcome =>
        turn.apiErrorReported
            ? { kind: 'reported' }
            : { error: new ClaudeTurnError(resultErrorDetail(result, fallback)), kind: 'failed' };
    switch (result.subtype) {
        case 'success':
            if (result.is_error) {
                return failed(
                    typeof result.api_error_status === 'number'
                        ? `Claude Code reported an API error (HTTP ${result.api_error_status})`
                        : 'Execution failed'
                );
            }
            // A blank answer after an in-band error is that error, not a quiet success (bridge).
            if (!result.result?.trim() && turn.observedError) {
                return failed(turn.observedError);
            }
            return { kind: 'success' };
        case 'error_max_budget_usd':
            return failed('Budget limit exceeded');
        case 'error_max_turns':
            return failed('Max turns exceeded');
        case 'error_max_structured_output_retries':
            return failed('Structured output retries exceeded');
        default:
            return failed('Execution failed');
    }
}

function resultErrorDetail(result: ClaudeResult, fallback: string): string {
    const parts: string[] = [];
    for (const error of result.errors ?? []) {
        if (typeof error === 'string' && error.trim()) {
            parts.push(error.trim());
        }
    }
    if (result.result?.trim()) {
        parts.push(result.result.trim());
    }
    return parts.join(' | ') || fallback;
}

/** Rate-limit evidence from `rate_limit_event`, scoped to one session (Raft task #379). */
export interface RateLimitObservation {
    readonly resetsAtSec?: number;
    readonly status: string;
}

const quotaExhaustedText = [
    /\breached your\b[^.\n]{0,60}\blimit\b/iu,
    /\bout of usage credits\b/iu,
    /\bhit your\b[^.\n]{0,60}\b(?:budget|spend limit|limit)\b/iu,
    /\bused your included\b[^.\n]{0,60}\busage\b/iu,
];

/**
 * The turn event for an assistant message Claude Code marked with its SDK `error` field: the
 * text is a CLI notice, not model output. A rejected credential is a typed `access` failure.
 */
export function assistantErrorEvent(input: {
    lastRateLimit: RateLimitObservation | null;
    now: number;
    sdkError: string;
    text: string;
}): TurnEvent {
    if (input.sdkError === 'authentication_failed') {
        return {
            category: 'access',
            severity: 'error',
            title: input.text,
            type: 'session-failure',
        };
    }
    if (input.sdkError === 'billing_error') {
        return {
            error: new ClaudeProviderLimitError('quota_exhausted', input.text),
            type: 'error',
        };
    }
    if (input.sdkError !== 'rate_limit') {
        return { error: new ClaudeTurnError(input.text), type: 'error' };
    }
    const limit = input.lastRateLimit;
    const rejectedWindowCurrent =
        limit?.status === 'rejected' &&
        (limit.resetsAtSec === undefined || limit.resetsAtSec * 1000 > input.now);
    if (limit && rejectedWindowCurrent) {
        const resetsAt =
            limit.resetsAtSec === undefined
                ? undefined
                : new Date(limit.resetsAtSec * 1000).toISOString();
        return {
            error: new ClaudeProviderLimitError('quota_exhausted', input.text, resetsAt),
            type: 'error',
        };
    }
    const kind = quotaExhaustedText.some((pattern) => pattern.test(input.text))
        ? 'quota_exhausted'
        : 'transient_rate_limit';
    return { error: new ClaudeProviderLimitError(kind, input.text), type: 'error' };
}

/** Raft: an `API Error:` notice with transport or HTTP evidence, in a turn with no tool call. */
export function isProviderApiFailureText(value: string): boolean {
    return (
        /^\s*API Error:/iu.test(value) &&
        (/\b(?:ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\b/iu.test(value) ||
            /\bUnable to connect to API\b/iu.test(value) ||
            /\b(?:timed out|timeout)\b/iu.test(value) ||
            /\b[45]\d{2}\b/u.test(value))
    );
}

/** The text a tool_result's content carries. */
export function contentText(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    if (!Array.isArray(content)) {
        return '';
    }
    return content
        .map((part) =>
            typeof part === 'object' &&
            part !== null &&
            'text' in part &&
            typeof part.text === 'string'
                ? part.text
                : ''
        )
        .join('');
}

/** An error, or a session failure that must end the turn now (specs/runtime-drivers.md). */
export function isFatalTurnEvent(event: TurnEvent): boolean {
    return (
        event.type === 'error' ||
        (event.type === 'session-failure' &&
            (event.severity === 'error' || event.category === 'access'))
    );
}
