/**
 * Failures a Claude Code turn ends on. Messages keep Claude's own text: Computer's failure
 * classifier and resume-rejection recovery read it (`runtime-failure.ts`, `resume-rejection.ts`).
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

/** Stored resume state this driver cannot resume; matches `isResumeRejection`. */
export class ClaudeResumeStateError extends Error {
    constructor(reason: string) {
        super(`Lifecycle state has unexpected shape for claude-code: ${reason}`);
        this.name = 'ClaudeResumeStateError';
    }
}
