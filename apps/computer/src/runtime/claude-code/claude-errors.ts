import { RuntimeResumeRejectedError } from '../resume-rejected.ts';

/**
 * Claude Code accepts `--resume <id>` for a conversation it no longer has and only says so when
 * prompted, as an error result. That result is the same typed rejection a driver throws from
 * `openSession`, so recovery is uniform across runtimes.
 */
export function claudeResumeRejection(error: Error): RuntimeResumeRejectedError | null {
    return /No conversation found with session ID/iu.test(error.message)
        ? new RuntimeResumeRejectedError('claude-code', 'missing', error.message, { cause: error })
        : null;
}

/**
 * A process that ended before answering the `initialize` handshake. Resuming a conversation
 * Claude Code no longer has exits at once with the same stderr line, so that case is the typed
 * rejection; anything else keeps the handshake's own error.
 */
export function claudeInitializeFailure(error: unknown, stderrTail: readonly string[]): unknown {
    return claudeResumeRejection(new Error(stderrTail.join('\n'))) ?? error;
}

/**
 * Failures a Claude Code turn ends on. Messages keep Claude's own text: Computer's failure
 * classifier reads it (`runtime-failure.ts`).
 */
export class ClaudeTurnError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ClaudeTurnError';
    }
}

/** Raft task #379: a used-up plan or budget versus a short throttle. */
export type ClaudeProviderLimitKind = 'quota_exhausted' | 'transient_rate_limit';

export class ClaudeProviderLimitError extends Error {
    constructor(
        readonly limit: ClaudeProviderLimitKind,
        text: string,
        readonly resetsAt?: string
    ) {
        super(
            limit === 'quota_exhausted'
                ? `Claude Code usage limit reached${resetsAt ? ` until ${resetsAt}` : ''}: ${text}`
                : `Claude Code rate limit: ${text}`
        );
        this.name = 'ClaudeProviderLimitError';
    }
}

/** The process ended before the turn reached its result. */
export class ClaudeProcessExitError extends Error {
    constructor(
        readonly exitCode: number | null,
        readonly exitSignal: string | null,
        stderrTail: readonly string[]
    ) {
        const how = exitSignal ? `signal ${exitSignal}` : `code ${exitCode ?? 'unknown'}`;
        const detail = stderrTail.length > 0 ? `: ${stderrTail.join(' | ')}` : '';
        super(`Claude Code exited (${how}) before the turn finished${detail}`);
        this.name = 'ClaudeProcessExitError';
    }
}
