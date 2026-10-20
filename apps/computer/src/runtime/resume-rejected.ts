/**
 * Why a runtime refused to resume stored state. `missing`: the native conversation is gone.
 * `archived`: the runtime archived it and would not restore it. `foreign-state`: another
 * runtime wrote the state. `invalid-state`: the state carries no conversation this runtime reads.
 */
export type RuntimeResumeRejection = 'archived' | 'foreign-state' | 'invalid-state' | 'missing';

/**
 * Proof that stored resume state is unusable, thrown by every driver (specs/runtime-drivers.md).
 * The executor rotates the generation and cold-starts once on this error and nothing else:
 * network, auth, rate-limit, busy-writer, and timeout failures keep the session and retry it.
 */
export class RuntimeResumeRejectedError extends Error {
    readonly reason: RuntimeResumeRejection;
    readonly runtimeId: string;

    constructor(
        runtimeId: string,
        reason: RuntimeResumeRejection,
        message: string,
        options?: { cause?: unknown }
    ) {
        super(message, options);
        this.name = 'RuntimeResumeRejectedError';
        this.reason = reason;
        this.runtimeId = runtimeId;
    }
}

/** Whether `error`, or an error it wraps, is a runtime's resume rejection. */
export function isRuntimeResumeRejection(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; depth < 6 && current; depth++) {
        if (current instanceof RuntimeResumeRejectedError) {
            return true;
        }
        current = current instanceof Error ? current.cause : undefined;
    }
    return false;
}
