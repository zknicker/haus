import { expect, test } from 'bun:test';
import { AgentSessionResumeRejectedError } from './harness/resume-rejection.ts';
import { RuntimeSessionFailureError } from './harness/runtime-session-failure.ts';
import { HarnessStartupTimeoutError } from './harness/start-gate.ts';
import { settleStoppedTurn } from './harness/stopped-turn.ts';
import {
    classifyRuntimeFailure,
    classifyRuntimeFailureCause,
    isContextWindowOverflow,
    isRetryableRuntimeFailure,
    runtimeFailureFields,
} from './runtime-failure.ts';

test('classifies operator-action failures as terminal', () => {
    for (const [message, kind] of [
        ['Not logged in. Run codex login.', 'authentication'],
        ['Unknown model gpt-nope', 'configuration'],
        ["Cannot find module '/agent/.harness-bootstrap/codex/bridge.mjs'", 'configuration'],
        ['Input exceeds the context window', 'input'],
    ] as const) {
        expect(classifyRuntimeFailure(new Error(message))).toBe(kind);
        expect(isRetryableRuntimeFailure(kind)).toBe(false);
    }
});

test('classifies transient failures for bounded retry', () => {
    for (const [message, kind] of [
        ['429 Too Many Requests', 'rate-limit'],
        ["You've hit your usage limit. Try again at 5pm.", 'rate-limit'],
        ['Selected model is at capacity. Please try a different model.', 'rate-limit'],
        [
            '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
            'transport',
        ],
        ['API Error: 529', 'transport'],
        ['503 Service Unavailable', 'transport'],
        ['Internal server error', 'transport'],
        ['WebSocket connection closed', 'transport'],
        ['Bridge startup timed out', 'timeout'],
    ] as const) {
        expect(classifyRuntimeFailure(new Error(message))).toBe(kind);
        expect(isRetryableRuntimeFailure(kind)).toBe(true);
    }
});

test('classifies a bare status code that carries no explanatory words', () => {
    for (const [message, kind] of [
        ['{"type":"error","status":401}', 'authentication'],
        ['HTTP 413', 'input'],
        ['{"type":"error","status":429}', 'rate-limit'],
    ] as const) {
        expect(classifyRuntimeFailure(new Error(message))).toBe(kind);
        expect(isRetryableRuntimeFailure(kind)).toBe(kind === 'rate-limit');
    }
});

test('leaves a number that merely contains a status code unclassified', () => {
    for (const message of ['Prompt is 14290 tokens', 'Bridge left port 4013']) {
        expect(classifyRuntimeFailure(new Error(message))).toBe('unknown');
    }
});

test('classifies the plain ACP bootstrap error without leaking its raw message', () => {
    expect(
        classifyRuntimeFailure({
            message: 'ACP session initialization failed: Authentication required',
        })
    ).toBe('authentication');
    expect(classifyRuntimeFailure({ cause: { message: 'Authentication required' } })).toBe(
        'authentication'
    );
    expect(classifyRuntimeFailure({ message: 'Something else failed' })).toBe('unknown');
});

test('invalid Claude credentials require operator action instead of repeated retries', () => {
    for (const message of [
        'Invalid Claude credentials in Keychain',
        'Claude authentication failed: invalid credentials in Keychain',
        'Claude authentication failed: invalid credentials in credential file',
    ]) {
        const kind = classifyRuntimeFailure(new Error(message));
        expect(kind).toBe('authentication');
        expect(isRetryableRuntimeFailure(kind)).toBe(false);
    }
});

test('recognizes a context-window overflow as terminal input', () => {
    for (const message of [
        'prompt is too long: 201234 tokens > 200000 maximum',
        'Your input exceeds the context window of this model.',
        'context_length_exceeded',
    ]) {
        expect(isContextWindowOverflow(new Error(message))).toBe(true);
        expect(classifyRuntimeFailure(new Error(message))).toBe('input');
    }
    expect(isContextWindowOverflow(new Error('HTTP 413'))).toBe(false);
});

test('a cancelled turn that never winds down fails as a retryable timeout', async () => {
    const neverSettles = { consumeStream: () => new Promise<void>(() => undefined) };

    const error = await settleStoppedTurn(neverSettles, 'codex', 5).catch((cause) => cause);

    expect(classifyRuntimeFailure(error)).toBe('timeout');
    expect(classifyRuntimeFailureCause(error)).toEqual({ code: 'turn-stalled', kind: 'timeout' });
});

test('names a stable failure code beside every kind', () => {
    for (const [error, kind, code] of [
        [new Error('Not logged in. Run codex login.'), 'authentication', 'authentication-required'],
        [new Error('Unknown model gpt-nope'), 'configuration', 'model-unavailable'],
        [
            new Error("Cannot find module '/agent/.harness-bootstrap/codex/bridge.mjs'"),
            'configuration',
            'configuration-invalid',
        ],
        [new Error('prompt is too long: 201234 tokens'), 'input', 'context-too-large'],
        [new Error('429 Too Many Requests'), 'rate-limit', 'rate-limited'],
        [new Error('Request timed out'), 'timeout', 'provider-unavailable'],
        [new Error('503 Service Unavailable'), 'transport', 'provider-unavailable'],
        [new Error('Something else failed'), 'unknown', 'provider-error'],
        [new HarnessStartupTimeoutError(120_000), 'timeout', 'launch-failed'],
        [new AgentSessionResumeRejectedError('agt_1'), 'session-resume', 'session-resume-rejected'],
        [
            new RuntimeSessionFailureError({ category: 'access', severity: 'error', title: 'x' }),
            'authentication',
            'authentication-required',
        ],
    ] as const) {
        expect(classifyRuntimeFailureCause(error)).toEqual({ code, kind });
    }
});

test('names a failed compaction unless a more specific cause explains it', () => {
    for (const message of [
        'Auto-compaction failed: summarizer returned nothing',
        'Error during compaction: Conversation too long',
        'Error running remote compact task',
    ]) {
        expect(classifyRuntimeFailureCause(new Error(message))).toEqual({
            code: 'compaction-failed',
            kind: 'input',
        });
    }
    expect(classifyRuntimeFailureCause(new Error('Compaction failed: 401 Unauthorized'))).toEqual({
        code: 'authentication-required',
        kind: 'authentication',
    });
});

test('failure fields carry a fingerprint only when raw text exists', () => {
    const fields = runtimeFailureFields(new Error('503 Service Unavailable'));
    expect(fields).toMatchObject({ failureCode: 'provider-unavailable', failureKind: 'transport' });
    expect(fields.failureFingerprint).toMatch(/^[0-9a-f]{16}$/u);
    expect(runtimeFailureFields(undefined).failureFingerprint).toBeUndefined();
});
