export class CodexUsageAuthError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'CodexUsageAuthError';
    }
}

export class CodexUsageRequestError extends Error {
    public readonly retryAfterMs: number | null;
    public readonly status: number;

    public constructor(message: string, status: number, retryAfterMs: number | null = null) {
        super(message);
        this.name = 'CodexUsageRequestError';
        this.retryAfterMs = retryAfterMs;
        this.status = status;
    }
}

export class CodexUsageParseError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'CodexUsageParseError';
    }
}
