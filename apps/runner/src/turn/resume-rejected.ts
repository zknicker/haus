export type RuntimeResumeRejection = 'invalid-state' | 'missing';

export class RuntimeResumeRejectedError extends Error {
    readonly harness: string;
    readonly reason: RuntimeResumeRejection;

    constructor(
        harness: string,
        reason: RuntimeResumeRejection,
        message: string,
        options?: { cause?: unknown }
    ) {
        super(message, options);
        this.name = 'RuntimeResumeRejectedError';
        this.harness = harness;
        this.reason = reason;
    }
}

export function isRuntimeResumeRejection(error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 6 && current; depth++) {
        if (current instanceof RuntimeResumeRejectedError) {
            return true;
        }
        current = current instanceof Error ? current.cause : undefined;
    }
    return false;
}
