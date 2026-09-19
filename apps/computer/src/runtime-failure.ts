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
    const message = runtimeErrorMessage(error);
    const normalized = message.toLowerCase();
    if (
        /not logged in|sign.?in required|unauthorized|authentication|invalid api key|oauth|\b401\b/u.test(
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
        /context window|too many tokens|input .*too large|payload too large|\b413\b/u.test(
            normalized
        )
    ) {
        return 'input';
    }
    if (/rate.?limit|too many requests|quota|\b429\b/u.test(normalized)) {
        return 'rate-limit';
    }
    if (/timed out|timeout/u.test(normalized)) {
        return 'timeout';
    }
    if (
        /econn|websocket|connection (closed|failed|refused|reset)|network|fetch failed/u.test(
            normalized
        )
    ) {
        return 'transport';
    }
    return 'unknown';
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
