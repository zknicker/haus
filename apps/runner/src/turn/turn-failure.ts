import { createHash } from 'node:crypto';
import type { AgentTurnSummary } from '@haus/api';
import { isRuntimeResumeRejection } from './resume-rejected.ts';
import type { SessionFailureTurnEvent } from './turn-event.ts';

type FailureFields = Required<Pick<AgentTurnSummary, 'failureCode' | 'failureKind'>>;

export class SessionFailureError extends Error {
    readonly category: string;

    constructor(failure: SessionFailureTurnEvent) {
        super(failure.title);
        this.name = 'SessionFailureError';
        this.category = failure.category;
    }
}

export class TurnStalledError extends Error {
    constructor() {
        super('The turn made no progress and was interrupted.');
        this.name = 'TurnStalledError';
    }
}

export class RunnerCrashedError extends Error {
    constructor() {
        super('The runner stopped while the turn was running.');
        this.name = 'RunnerCrashedError';
    }
}

export function turnFailureFields(error: unknown) {
    const fingerprint = failureFingerprint(errorText(error));
    return {
        ...classifyFailure(error),
        ...(fingerprint ? { failureFingerprint: fingerprint } : {}),
    };
}

export function classifyFailure(error: unknown) {
    const failure = (
        failureCode: FailureFields['failureCode'],
        failureKind: FailureFields['failureKind']
    ) => {
        const fields: FailureFields = { failureCode, failureKind };
        return fields;
    };
    if (isRuntimeResumeRejection(error)) {
        return failure('session-resume-rejected', 'session-resume');
    }
    if (error instanceof TurnStalledError) {
        return failure('turn-stalled', 'timeout');
    }
    if (error instanceof RunnerCrashedError) {
        return failure('runner-crashed', 'unknown');
    }
    if (error instanceof SessionFailureError && error.category === 'access') {
        return failure('authentication-required', 'authentication');
    }
    const text = errorText(error).toLowerCase();
    if (/compaction failed|failed to compact|error during compaction/u.test(text)) {
        return failure('compaction-failed', 'input');
    }
    if (
        /not logged in|sign.?in required|unauthorized|authentication|invalid api key|oauth|\b401\b/u.test(
            text
        )
    ) {
        return failure('authentication-required', 'authentication');
    }
    if (/unknown model|model .*(not found|unsupported|invalid)|invalid model/u.test(text)) {
        return failure('model-unavailable', 'configuration');
    }
    if (
        /context window|context.?length.?exceeded|maximum context length|prompt is too long|too many tokens|\b413\b/u.test(
            text
        )
    ) {
        return failure('context-too-large', 'input');
    }
    if (/rate.?limit|too many requests|quota|usage limit|at capacity|\b429\b/u.test(text)) {
        return failure('rate-limited', 'rate-limit');
    }
    if (/timed out|timeout/u.test(text)) {
        return failure('provider-unavailable', 'timeout');
    }
    if (
        /econn|connection (closed|failed|refused|reset)|network|fetch failed|overloaded|internal server error|bad gateway|service unavailable|\b(?:500|502|503|504|529)\b/u.test(
            text
        )
    ) {
        return failure('provider-unavailable', 'transport');
    }
    return failure('provider-error', 'unknown');
}

function errorText(error: unknown) {
    const parts: string[] = [];
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current; depth++) {
        if (typeof current === 'string') {
            parts.push(current);
            break;
        }
        if (typeof current !== 'object') {
            break;
        }
        const value = current as { cause?: unknown; message?: unknown; name?: unknown };
        parts.push(
            typeof value.name === 'string' ? value.name : '',
            typeof value.message === 'string' ? value.message : ''
        );
        current = value.cause;
    }
    return parts.join(' ');
}

function failureFingerprint(rawText: string) {
    const normalized = rawText
        .toLowerCase()
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gu, '<uuid>')
        .replace(/\b[a-z]{2,8}_(?=[0-9a-z]*\d)[0-9a-z]{10,}\b/gu, '<id>')
        .replace(/\b[0-9a-f]{12,}\b/gu, '<hex>')
        .replace(/\b\d+\b/gu, '<num>')
        .replace(/\s+/gu, ' ')
        .trim();
    return normalized ? createHash('sha256').update(normalized).digest('hex').slice(0, 16) : null;
}
