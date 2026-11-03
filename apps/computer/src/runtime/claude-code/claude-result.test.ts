// Ported from botiverse/raft-source packages/daemon/src/drivers/claudeEventNormalizer.test.ts (FSL-1.1-ALv2)
import { expect, test } from 'bun:test';
import { classifyRuntimeFailure } from '../../runtime-failure.ts';
import { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import { type ClaudeResult, parseClaudeLine } from './claude-messages.ts';
import { type ClaudeResultOutcome, classifyResult, claudeTokenUsage } from './claude-result.ts';

const fresh = { apiErrorReported: false };

function result(fields: Record<string, unknown>): ClaudeResult {
    return { subtype: 'success', type: 'result', ...fields } as ClaudeResult;
}

function failure(outcome: ClaudeResultOutcome): string | undefined {
    return outcome.kind === 'failed' ? outcome.error.message : undefined;
}

test('normalizes result error_during_execution errors', () => {
    const outcome = classifyResult(
        result({
            errors: ['MCP server failed'],
            is_error: true,
            result: '',
            subtype: 'error_during_execution',
        }),
        fresh
    );
    expect(failure(outcome)).toBe('MCP server failed');
});

test('normalizes result success errors when is_error is true', () => {
    expect(
        failure(
            classifyResult(
                result({ errors: [], is_error: true, result: 'Authentication failed' }),
                fresh
            )
        )
    ).toBe('Authentication failed');
});

test('normalizes budget limit result subtype as an error', () => {
    expect(
        failure(classifyResult(result({ result: '', subtype: 'error_max_budget_usd' }), fresh))
    ).toBe('Budget limit exceeded');
});

test('normalizes max_tokens result errors when Claude marks the result as error', () => {
    const outcome = classifyResult(
        result({
            errors: ['some error'],
            is_error: true,
            result: 'Token limit reached',
            stop_reason: 'max_tokens',
            subtype: 'error_during_execution',
        }),
        fresh
    );
    expect(failure(outcome)).toBe('some error | Token limit reached');
});

test('does not treat non-error max_tokens result stops as execution errors', () => {
    expect(
        classifyResult(
            result({ is_error: false, result: 'Partial answer', stop_reason: 'max_tokens' }),
            fresh
        )
    ).toEqual({ kind: 'success' });
});

test('result usage is per-turn Haus token usage with cache reads and writes', () => {
    expect(
        claudeTokenUsage({
            cache_creation_input_tokens: 30,
            cache_read_input_tokens: 20,
            input_tokens: 154,
            output_tokens: 4,
        })
    ).toEqual({
        cacheReadTokens: 20,
        cacheWriteTokens: 30,
        inputTokens: 204,
        outputTokens: 4,
        totalTokens: 208,
    });
});

// task #379: Claude Code wraps API errors (usage limits, auth, overload) in an assistant message
// carrying the SDK `error` field, followed by a result with is_error.
const quotaText =
    "You've reached your Fable limit. Switch to another model, or manage usage credits.";

function harness(now = () => Date.now()) {
    const normalizer = new ClaudeEventNormalizer({
        hostServer: 'haus',
        now,
        strip: (value) => value,
    });
    const send = (message: Record<string, unknown>) => {
        const parsed = parseClaudeLine(JSON.stringify({ session_id: 'session-379', ...message }));
        if (!parsed || 'invalid' in parsed) {
            throw new Error('unparsed');
        }
        return normalizer.normalize(parsed);
    };
    const apiError = (error: string, text: string, sessionId = 'session-379') =>
        send({
            error,
            message: { content: [{ text, type: 'text' }], model: '<synthetic>' },
            session_id: sessionId,
            type: 'assistant',
        })[0];
    return { apiError, normalizer, send };
}

test('task #379: an assistant message with the SDK error field is an error, not model text', () => {
    const event = harness().apiError('rate_limit', quotaText);
    expect(event).toMatchObject({ error: { limit: 'quota_exhausted' }, type: 'error' });
    expect(classifyRuntimeFailure(event?.type === 'error' ? event.error : null)).toBe('rate-limit');
});

test('task #379: the result of a turn whose API error was already reported does not report it twice', () => {
    const { apiError, normalizer } = harness();
    apiError('rate_limit', quotaText);
    expect(classifyResult(result({ is_error: true, result: quotaText }), normalizer)).toEqual({
        kind: 'reported',
    });
    normalizer.beginTurn();
    expect(
        failure(classifyResult(result({ is_error: true, result: 'Another reason' }), normalizer))
    ).toBe('Another reason');
});

const beforeResetMs = 1_791_800_000 * 1000;

test('task #379: a rejected rate-limit window marks the limit used up with its reset time', () => {
    const { apiError, send } = harness(() => beforeResetMs);
    send({
        rate_limit_info: { resetsAt: 1_791_900_000, status: 'rejected' },
        type: 'rate_limit_event',
    });
    expect(apiError('rate_limit', 'API Error: Rate limit reached')).toMatchObject({
        error: { limit: 'quota_exhausted', resetsAt: new Date(1_791_900_000 * 1000).toISOString() },
    });
});

test('task #379: a rate limit without used-up evidence stays a transient throttle', () => {
    const { apiError, send } = harness();
    send({
        rate_limit_info: { resetsAt: 1_791_900_000, status: 'allowed_warning' },
        type: 'rate_limit_event',
    });
    expect(apiError('rate_limit', 'API Error: Request rate limited')).toMatchObject({
        error: { limit: 'transient_rate_limit' },
    });
});

test('task #379: a rejected window past its reset, or from another session, is not used-up evidence', () => {
    let now = beforeResetMs;
    const { apiError, send } = harness(() => now);
    send({
        rate_limit_info: { resetsAt: 1_791_900_000, status: 'rejected' },
        type: 'rate_limit_event',
    });
    now = 1_791_900_001 * 1000;
    expect(apiError('rate_limit', 'Too many requests')).toMatchObject({
        error: { limit: 'transient_rate_limit' },
    });
    const other = harness(() => 0);
    other.send({
        rate_limit_info: { status: 'rejected' },
        session_id: 'old',
        type: 'rate_limit_event',
    });
    other.send({ session_id: 'new', subtype: 'init', type: 'system' });
    expect(other.apiError('rate_limit', 'Too many requests', 'new')).toMatchObject({
        error: { limit: 'transient_rate_limit' },
    });
});

test('task #379: other SDK errors are errors; a rejected login is a typed access failure', () => {
    expect(harness().apiError('overloaded', 'API Error: Overloaded')).toMatchObject({
        error: { message: 'API Error: Overloaded' },
        type: 'error',
    });
    expect(harness().apiError('authentication_failed', 'Not logged in')).toEqual({
        category: 'access',
        severity: 'error',
        title: 'Not logged in',
        type: 'session-failure',
    });
});

test('an unrecoverable API retry ends the turn; a transient one is liveness', () => {
    const { send } = harness();
    expect(
        send({
            error: 'invalid x-api-key',
            error_status: 401,
            subtype: 'api_retry',
            type: 'system',
        })
    ).toEqual([
        {
            category: 'access',
            severity: 'error',
            title: 'HTTP 401: invalid x-api-key',
            type: 'session-failure',
        },
    ]);
    expect(
        send({ error: 'overloaded', error_status: 529, subtype: 'api_retry', type: 'system' })
    ).toEqual([{ nativeType: 'system:api_retry', type: 'progress' }]);
});
