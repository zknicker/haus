/** A Codex turn ended `failed`, `interrupted` on its own, or empty; the message is Codex's. */
export class CodexTurnFailedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CodexTurnFailedError';
    }
}

/** Why Codex refused to resume a stored thread. */
export type CodexResumeRejection = 'archived' | 'missing-rollout' | 'thread-writer-busy';

/**
 * Stored resume state Codex proved unusable. The message keeps Codex's own words; for a missing
 * rollout they match `isResumeRejection` already (`no rollout found for thread id`).
 */
export class CodexResumeRejectedError extends Error {
    readonly reason: CodexResumeRejection;
    readonly threadId: string;

    constructor(threadId: string, reason: CodexResumeRejection, options: { cause: unknown }) {
        const detail =
            options.cause instanceof Error ? options.cause.message : String(options.cause);
        super(`Codex could not resume thread ${threadId} (${reason}): ${detail}`, options);
        this.name = 'CodexResumeRejectedError';
        this.reason = reason;
        this.threadId = threadId;
    }
}

/**
 * Classifies a `thread/resume` refusal (Raft `classifyCodexResumeError`). Anything else, such
 * as a permission error, is no proof the thread is unusable and stays a startup failure.
 */
export function classifyResumeRefusal(message: string): CodexResumeRejection | null {
    if (/\bis\s+archived\b/iu.test(message)) {
        return 'archived';
    }
    if (
        /\bno\s+rollout\s+found\b/iu.test(message) ||
        /\bmissing\s+rollout\b/iu.test(message) ||
        /\brollout\b.*\b(?:not found|missing)\b/iu.test(message) ||
        /\bthread\b.*\b(?:not found|missing)\b/iu.test(message) ||
        /\bmissing\s+thread\b/iu.test(message)
    ) {
        return 'missing-rollout';
    }
    if (/\balready\s+has\s+an\s+active\s+writer\b/iu.test(message)) {
        return 'thread-writer-busy';
    }
    return null;
}
