import { RuntimeResumeRejectedError } from './resume-rejected.ts';

/**
 * TEMPORARY, with the AI SDK adapter: the harness reports unusable resume state only as text, so
 * the adapter alone matches it and rethrows the typed rejection every driver throws. Anything
 * else (network, auth, rate limit, timeout) keeps the session and retries it.
 */
const promptResumeRejectionPatterns = [
    // Claude Code: the stored conversation no longer exists.
    /No conversation found with session ID/iu,
];

const openResumeRejectionPatterns = [
    ...promptResumeRejectionPatterns,
    // Codex app-server: the stored thread's rollout is gone.
    /no rollout found for (?:thread|conversation) id/iu,
    // ACP runtimes: the stored session id is unknown to the agent. Creation-only: MCP servers
    // answer an expired tool session with the same words mid-turn.
    /\bsession not found\b/iu,
    // AI SDK Harness: stored lifecycle state does not validate for this adapter.
    /Lifecycle state (?:has unexpected|was produced by harness|failed schema validation)/iu,
    /ACP lifecycle state (?:was produced by|is incompatible|belongs to sandbox|data is missing)/iu,
];

/** A harness failure opening stored state, as the typed rejection when the text proves it. */
export function harnessOpenRejection(runtimeId: string, error: unknown): unknown {
    return typedRejection(runtimeId, error, openResumeRejectionPatterns);
}

/** A harness failure once prompted: only runtime-specific evidence, never tool-borne text. */
export function harnessPromptRejection(runtimeId: string, error: unknown): unknown {
    return typedRejection(runtimeId, error, promptResumeRejectionPatterns);
}

function typedRejection(runtimeId: string, error: unknown, patterns: readonly RegExp[]): unknown {
    const message = errorText(error);
    return patterns.some((pattern) => pattern.test(message))
        ? new RuntimeResumeRejectedError(runtimeId, 'missing', message.trim(), { cause: error })
        : error;
}

// Stream error parts arrive as plain objects, often wrapped in a cause chain.
function errorText(error: unknown, depth = 0): string {
    if (typeof error === 'string') {
        return error;
    }
    if (depth > 4 || !error || typeof error !== 'object') {
        return '';
    }
    const value = error as { cause?: unknown; error?: unknown; message?: unknown };
    return [
        typeof value.message === 'string' ? value.message : '',
        errorText(value.cause, depth + 1),
        errorText(value.error, depth + 1),
    ].join(' ');
}
