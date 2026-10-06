import type { AgentTurnFailureCode } from '@haus/api';
import { failureFingerprint } from './failure-fingerprint.ts';
import { AgentSessionResumeRejectedError } from './harness/resume-rejection.ts';
import { RuntimeSessionFailureError } from './harness/runtime-session-failure.ts';
import { HarnessStartupTimeoutError } from './harness/start-gate.ts';

export type RuntimeFailureKind =
    | 'authentication'
    | 'configuration'
    | 'input'
    | 'rate-limit'
    | 'session-resume'
    | 'timeout'
    | 'transport'
    | 'unknown';

/** The retry category plus the stable cause; both are decided here so nothing downstream reads text. */
export interface RuntimeFailure {
    code: AgentTurnFailureCode;
    kind: RuntimeFailureKind;
}

/** Typed signals first; the text classifier is the fallback for runtimes that only report prose. */
export function classifyRuntimeFailureCause(error: unknown): RuntimeFailure {
    if (error instanceof AgentSessionResumeRejectedError) {
        return { code: 'session-resume-rejected', kind: 'session-resume' };
    }
    if (error instanceof HarnessStartupTimeoutError) {
        return { code: 'launch-failed', kind: 'timeout' };
    }
    // A typed runtime failure names a rejected credential by category; its title may not.
    if (error instanceof RuntimeSessionFailureError && error.category === 'access') {
        return { code: 'authentication-required', kind: 'authentication' };
    }
    const normalized = runtimeErrorText(error).toLowerCase();
    const failure = classifyRuntimeFailureText(normalized);
    // A failed compaction leaves history that cannot shrink; the cause matters more than the symptom.
    if (
        compactionFailurePattern.test(normalized) &&
        (failure.code === 'provider-error' || failure.code === 'context-too-large')
    ) {
        return { code: 'compaction-failed', kind: 'input' };
    }
    return failure;
}

/** The failure fields a turn summary carries: kind, code, and a hash of the raw text when any. */
export interface RuntimeFailureFields {
    failureCode: AgentTurnFailureCode;
    failureFingerprint?: string;
    failureKind: RuntimeFailureKind;
}

export function runtimeFailureFields(
    error: unknown,
    failure: RuntimeFailure = classifyRuntimeFailureCause(error)
): RuntimeFailureFields {
    const fingerprint = failureFingerprint(runtimeErrorText(error));
    return {
        failureCode: failure.code,
        failureKind: failure.kind,
        ...(fingerprint ? { failureFingerprint: fingerprint } : {}),
    };
}

export function classifyRuntimeFailure(error: unknown): RuntimeFailureKind {
    return classifyRuntimeFailureCause(error).kind;
}

/** The session's history no longer fits the model; only a session reset recovers it. */
export function isContextWindowOverflow(error: unknown): boolean {
    return contextOverflowPattern.test(runtimeErrorText(error).toLowerCase());
}

export function isRetryableRuntimeFailure(kind: RuntimeFailureKind): boolean {
    return !['authentication', 'configuration', 'input'].includes(kind);
}

/** The raw runtime text (name, message, and cause chain). It never leaves the Computer. */
export function runtimeErrorText(error: unknown, depth = 0): string {
    // ACP error parts arrive as plain objects rather than native Error instances.
    if (depth > 4 || !error || typeof error !== 'object') {
        return typeof error === 'string' ? error : '';
    }
    const value = error as { name?: unknown; message?: unknown; cause?: unknown };
    return [
        typeof value.name === 'string' ? value.name : '',
        typeof value.message === 'string' ? value.message : '',
        runtimeErrorText(value.cause, depth + 1),
    ].join(' ');
}

const contextOverflowPattern =
    /context window|context.?length.?exceeded|maximum context length|prompt is too long/u;

// Pi: "Compaction failed"/"Auto-compaction failed"; Claude Code: "Error during compaction";
// Codex: "Error running remote compact task". No harness surfaces a typed compaction failure.
const compactionFailurePattern =
    /compaction failed|failed to compact|error during compaction|compact task/u;

function classifyRuntimeFailureText(normalized: string): RuntimeFailure {
    if (
        /not logged in|sign.?in required|unauthorized|authentication|(?:invalid|incorrect) (?:api key|\w+ credentials)|invalid_api_key|oauth|\b401\b/u.test(
            normalized
        )
    ) {
        return { code: 'authentication-required', kind: 'authentication' };
    }
    if (
        /unknown model|model .*(not found|unsupported|invalid)|unsupported model|invalid model/u.test(
            normalized
        )
    ) {
        return { code: 'model-unavailable', kind: 'configuration' };
    }
    if (/cannot find module .*\.harness-bootstrap/u.test(normalized)) {
        return { code: 'configuration-invalid', kind: 'configuration' };
    }
    if (
        contextOverflowPattern.test(normalized) ||
        /too many tokens|input .*too large|payload too large|\b413\b/u.test(normalized)
    ) {
        return { code: 'context-too-large', kind: 'input' };
    }
    if (/rate.?limit|too many requests|quota|usage limit|at capacity|\b429\b/u.test(normalized)) {
        return { code: 'rate-limited', kind: 'rate-limit' };
    }
    // A provider request that timed out; a turn stall is reported by the harness, not as text.
    if (/timed out|timeout/u.test(normalized)) {
        return { code: 'provider-unavailable', kind: 'timeout' };
    }
    if (
        /econn|websocket|connection (closed|failed|refused|reset)|network|fetch failed|overloaded|internal server error|bad gateway|service unavailable|\b(?:500|502|503|504|529)\b/u.test(
            normalized
        )
    ) {
        return { code: 'provider-unavailable', kind: 'transport' };
    }
    return { code: 'provider-error', kind: 'unknown' };
}
