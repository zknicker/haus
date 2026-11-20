import { RuntimeResumeRejectedError } from '../turn/resume-rejected.ts';

export class ClaudeTurnError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ClaudeTurnError';
    }
}

export type ClaudeProviderLimitKind = 'quota_exhausted' | 'transient_rate_limit';

export class ClaudeProviderLimitError extends Error {
    readonly limit: ClaudeProviderLimitKind;
    readonly resetsAt?: string;

    constructor(limit: ClaudeProviderLimitKind, text: string, resetsAt?: string) {
        super(
            limit === 'quota_exhausted'
                ? `Claude usage limit reached${resetsAt ? ` until ${resetsAt}` : ''}: ${text}`
                : `Claude rate limit: ${text}`
        );
        this.name = 'ClaudeProviderLimitError';
        this.limit = limit;
        if (resetsAt) {
            this.resetsAt = resetsAt;
        }
    }
}

export class ClaudeSessionEndedError extends Error {
    constructor(cause: unknown) {
        super(
            `The Claude Agent SDK session ended before the turn finished: ${
                cause instanceof Error ? cause.message : String(cause)
            }`,
            { cause }
        );
        this.name = 'ClaudeSessionEndedError';
    }
}

export function claudeResumeRejection(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    return missingConversation.test(text)
        ? new RuntimeResumeRejectedError('claude-agent-sdk', 'missing', text, { cause: error })
        : null;
}

const missingConversation = /No conversation found with session ID/iu;
