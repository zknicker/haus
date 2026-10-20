import type { SessionFailureTurnEvent } from '../turn-event.ts';
import type { CodexTurnError } from './protocol.ts';

/**
 * The policy categories Haus reads Codex failures by, so Activity and the turn stream classify
 * them consistently: `access` is a rejected credential (fatal even as a
 * retry warning), `limit` a rate limit, quota, or exhausted context, `connection` a lost
 * transport, `service` a provider fault, `request` a refused or malformed request.
 */
export type CodexFailureCategory = 'access' | 'connection' | 'limit' | 'request' | 'service';

const stringCategories: Readonly<Record<string, CodexFailureCategory>> = {
    badRequest: 'request',
    contextWindowExceeded: 'limit',
    cyberPolicy: 'request',
    internalServerError: 'service',
    misalignmentPolicyViolation: 'request',
    other: 'service',
    rateLimitExceeded: 'limit',
    sandboxError: 'service',
    serverOverloaded: 'service',
    sessionBudgetExceeded: 'limit',
    threadRollbackFailed: 'service',
    unauthorized: 'access',
    usageLimitExceeded: 'limit',
};

const structuredCategories: Readonly<Record<string, CodexFailureCategory>> = {
    activeTurnNotSteerable: 'service',
    httpConnectionFailed: 'connection',
    responseStreamConnectionFailed: 'connection',
    responseStreamDisconnected: 'connection',
    responseTooManyFailedAttempts: 'connection',
};

/** An app-server `error` notification as a typed failure; `willRetry` makes it a warning. */
export function codexSessionFailure(
    error: CodexTurnError,
    willRetry: boolean
): SessionFailureTurnEvent {
    return {
        category: codexFailureCategory(error.codexErrorInfo ?? null),
        severity: willRetry ? 'warning' : 'error',
        title: error.message,
        type: 'session-failure',
    };
}

export function codexFailureCategory(
    info: string | Record<string, unknown> | null
): CodexFailureCategory {
    const status = httpStatus(info);
    if (info === 'unauthorized' || status === 401) {
        return 'access';
    }
    if (status === 429) {
        return 'limit';
    }
    if (typeof info === 'string') {
        return stringCategories[info] ?? 'service';
    }
    if (info !== null) {
        const [kind] = Object.keys(info);
        return (kind && structuredCategories[kind]) || 'service';
    }
    return 'service';
}

function httpStatus(info: string | Record<string, unknown> | null): number | null {
    if (info === null || typeof info !== 'object') {
        return null;
    }
    const [details] = Object.values(info);
    if (typeof details !== 'object' || details === null || !('httpStatusCode' in details)) {
        return null;
    }
    const code = (details as { httpStatusCode: unknown }).httpStatusCode;
    return typeof code === 'number' ? code : null;
}
