import type { RuntimeTokenUsage, TurnEvent } from '../turn/turn-event.ts';
import { ClaudeProviderLimitError, ClaudeTurnError } from './claude-errors.ts';
import type { ClaudeResult, ClaudeUsage } from './claude-messages.ts';

export function claudeTokenUsage(usage: ClaudeUsage | null | undefined) {
    if (!usage) {
        return null;
    }
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const inputTokens = (usage.input_tokens ?? 0) + cacheReadTokens + cacheWriteTokens;
    const tokens: RuntimeTokenUsage = {
        cacheReadTokens,
        cacheWriteTokens,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
    return tokens;
}

export type ClaudeResultOutcome =
    | { readonly error: Error; readonly kind: 'failed' }
    | { readonly kind: 'reported' }
    | { readonly kind: 'success' };

export function classifyResult(
    result: ClaudeResult,
    turn: { apiErrorReported: boolean; observedError?: string }
) {
    const failed = (fallback: string) => {
        const outcome: ClaudeResultOutcome = turn.apiErrorReported
            ? { kind: 'reported' }
            : { error: new ClaudeTurnError(resultErrorDetail(result, fallback)), kind: 'failed' };
        return outcome;
    };
    const success: ClaudeResultOutcome = { kind: 'success' };
    switch (result.subtype) {
        case 'success':
            if (result.is_error) {
                return failed(
                    typeof result.api_error_status === 'number'
                        ? `Claude reported an API error (HTTP ${result.api_error_status})`
                        : 'Execution failed'
                );
            }
            if (!result.result?.trim() && turn.observedError) {
                return failed(turn.observedError);
            }
            return success;
        case 'error_max_budget_usd':
            return failed('Budget limit exceeded');
        case 'error_max_turns':
            return failed('Max turns exceeded');
        default:
            return failed('Execution failed');
    }
}

export function answeredMessages(result: ClaudeResult) {
    return [result.user_message_uuid, ...(result.user_message_uuids ?? [])].filter(
        (uuid): uuid is string => Boolean(uuid)
    );
}

export interface RateLimitObservation {
    readonly resetsAtSec?: number;
    readonly status: string;
}

export function assistantErrorEvent(input: {
    lastRateLimit: RateLimitObservation | null;
    now: number;
    sdkError: string;
    text: string;
}) {
    const event = (error: Error) => {
        const failure: TurnEvent = { error, type: 'error' };
        return failure;
    };
    if (input.sdkError === 'authentication_failed') {
        const access: TurnEvent = {
            category: 'access',
            severity: 'error',
            title: input.text,
            type: 'session-failure',
        };
        return access;
    }
    if (input.sdkError === 'billing_error') {
        return event(new ClaudeProviderLimitError('quota_exhausted', input.text));
    }
    if (input.sdkError !== 'rate_limit') {
        return event(new ClaudeTurnError(input.text));
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
        return event(new ClaudeProviderLimitError('quota_exhausted', input.text, resetsAt));
    }
    const kind = quotaExhaustedText.some((pattern) => pattern.test(input.text))
        ? 'quota_exhausted'
        : 'transient_rate_limit';
    return event(new ClaudeProviderLimitError(kind, input.text));
}

export function isProviderApiFailureText(value: string) {
    return (
        /^\s*API Error:/iu.test(value) &&
        (/\b(?:ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)\b/iu.test(value) ||
            /\bUnable to connect to API\b/iu.test(value) ||
            /\b(?:timed out|timeout)\b/iu.test(value) ||
            /\b[45]\d{2}\b/u.test(value))
    );
}

export function contentText(content: unknown) {
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

const quotaExhaustedText = [
    /\breached your\b[^.\n]{0,60}\blimit\b/iu,
    /\bout of usage credits\b/iu,
    /\bhit your\b[^.\n]{0,60}\b(?:budget|spend limit|limit)\b/iu,
    /\bused your included\b[^.\n]{0,60}\busage\b/iu,
];

function resultErrorDetail(result: ClaudeResult, fallback: string) {
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
