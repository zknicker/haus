import type { LinearToolErrorCode } from '@haus/api/linear-actor-meta';

const retryableCodes = new Set<LinearToolErrorCode>([
    'linear_rate_limited',
    'linear_upstream_error',
]);

/** A refusal the tool reports to the Agent; the message never carries request `_meta`. */
export class LinearToolError extends Error {
    readonly code: LinearToolErrorCode;
    /** Linear's rate-limit reset, when it sent one. */
    readonly resetAt: string | null;

    constructor(code: LinearToolErrorCode, message: string, resetAt: string | null = null) {
        super(message);
        this.code = code;
        this.resetAt = resetAt;
    }

    get retryable() {
        return retryableCodes.has(this.code);
    }

    toStructured() {
        return {
            error: {
                code: this.code,
                message: this.message,
                retryable: this.retryable,
                ...(this.resetAt ? { resetAt: this.resetAt } : {}),
            },
        };
    }
}

export function inputError(message: string): LinearToolError {
    return new LinearToolError('linear_input_error', message);
}
