import { RuntimeSessionFailureError } from './harness/runtime-session-failure.ts';
import { StoppedTurnTimeoutError } from './harness/stopped-turn.ts';

export type RuntimeFailureKind =
    | 'authentication'
    | 'configuration'
    | 'input'
    | 'rate-limit'
    | 'session-resume'
    | 'timeout'
    | 'transport'
    | 'unknown';

export function classifyRuntimeFailure(error: unknown): RuntimeFailureKind {
    // A typed runtime failure names a rejected credential by category; its title may not.
    if (error instanceof RuntimeSessionFailureError && error.category === 'access') {
        return 'authentication';
    }
    if (error instanceof StoppedTurnTimeoutError) {
        return 'timeout';
    }
    const message = runtimeErrorMessage(error);
    const normalized = message.toLowerCase();
    if (
        /not logged in|sign.?in required|unauthorized|authentication|(?:invalid|incorrect) (?:api key|\w+ credentials)|invalid_api_key|oauth|\b401\b/u.test(
            normalized
        )
    ) {
        return 'authentication';
    }
    if (
        /unknown model|model .*(not found|unsupported|invalid)|unsupported model|invalid model|cannot find module .*\.harness-bootstrap/u.test(
            normalized
        )
    ) {
        return 'configuration';
    }
    if (
        contextOverflowPattern.test(normalized) ||
        /too many tokens|input .*too large|payload too large|\b413\b/u.test(normalized)
    ) {
        return 'input';
    }
    if (/rate.?limit|too many requests|quota|usage limit|at capacity|\b429\b/u.test(normalized)) {
        return 'rate-limit';
    }
    if (/timed out|timeout/u.test(normalized)) {
        return 'timeout';
    }
    if (
        /econn|websocket|connection (closed|failed|refused|reset)|network|fetch failed|overloaded|internal server error|bad gateway|service unavailable|\b(?:500|502|503|504|529)\b/u.test(
            normalized
        )
    ) {
        return 'transport';
    }
    return 'unknown';
}

const contextOverflowPattern =
    /context window|context.?length.?exceeded|maximum context length|prompt is too long/u;

/** The session's history no longer fits the model; only a session reset recovers it. */
export function isContextWindowOverflow(error: unknown): boolean {
    return contextOverflowPattern.test(runtimeErrorMessage(error).toLowerCase());
}

export function isRetryableRuntimeFailure(kind: RuntimeFailureKind): boolean {
    return !['authentication', 'configuration', 'input'].includes(kind);
}

// ACP error parts arrive as plain objects rather than native Error instances.
function runtimeErrorMessage(error: unknown, depth = 0): string {
    if (depth > 4 || !error || typeof error !== 'object') {
        return typeof error === 'string' ? error : '';
    }
    const value = error as { name?: unknown; message?: unknown; cause?: unknown };
    return [
        typeof value.name === 'string' ? value.name : '',
        typeof value.message === 'string' ? value.message : '',
        runtimeErrorMessage(value.cause, depth + 1),
    ].join(' ');
}
