import { RuntimeResumeRejectedError } from '../resume-rejected.ts';

/** A Codex turn ended `failed`, `interrupted` on its own, or empty; the message is Codex's. */
export class CodexTurnFailedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CodexTurnFailedError';
    }
}

/** Why Codex refused to resume a stored thread. */
export type CodexResumeRefusal = 'archived' | 'missing-rollout' | 'thread-writer-busy';

/**
 * Stored resume state Codex proved unusable: its rollout is gone, or it is archived and would
 * not unarchive. The message keeps Codex's own words.
 */
export class CodexResumeRejectedError extends RuntimeResumeRejectedError {
    readonly codexReason: 'archived' | 'missing-rollout';
    readonly threadId: string;

    constructor(
        threadId: string,
        reason: 'archived' | 'missing-rollout',
        options: { cause: unknown }
    ) {
        super(
            'codex',
            reason === 'archived' ? 'archived' : 'missing',
            `Codex could not resume thread ${threadId} (${reason}): ${causeText(options.cause)}`,
            options
        );
        this.name = 'CodexResumeRejectedError';
        this.codexReason = reason;
        this.threadId = threadId;
    }
}

/**
 * Another app-server is still writing the thread. The thread itself is intact, so this is a
 * retryable startup failure, never a resume rejection that would discard the conversation.
 */
export class CodexThreadBusyError extends Error {
    constructor(threadId: string, options: { cause: unknown }) {
        super(
            `Codex thread ${threadId} already has an active writer: ${causeText(options.cause)}`,
            options
        );
        this.name = 'CodexThreadBusyError';
    }
}

function causeText(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Classifies a `thread/resume` refusal (Raft `classifyCodexResumeError`). Anything else, such
 * as a permission error, is no proof the thread is unusable and stays a startup failure.
 */
export function classifyResumeRefusal(message: string): CodexResumeRefusal | null {
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
