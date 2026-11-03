/**
 * A provider failure a runtime driver reported in-band (`session-failure`): one per retry warning,
 * and the terminal failure beside the settled turn. The category is the policy category Codex
 * reports (`runtime/codex/session-failure.ts`); `access` is a rejected credential.
 */
export interface RuntimeSessionFailure {
    category: string;
    severity: 'error' | 'warning';
    title: string;
}

/** A provider failure the runtime reported in-band; its title is the provider's message. */
export class RuntimeSessionFailureError extends Error {
    readonly category: string;
    readonly severity: RuntimeSessionFailure['severity'];

    constructor(failure: RuntimeSessionFailure) {
        super(failure.title);
        this.name = 'RuntimeSessionFailureError';
        this.category = failure.category;
        this.severity = failure.severity;
    }
}

/**
 * The failure that must end the turn now: a terminal error, or a retry warning for a
 * rejected credential. Codex retries a 401 five times per transport (~30s) before
 * giving up, and no retry can repair a credential. Other warnings stay transient.
 */
export function fatalRuntimeSessionFailure(
    failure: RuntimeSessionFailure
): RuntimeSessionFailureError | null {
    // Only a retry's category carries the HTTP status; its title is just "Reconnecting... n/5".
    return failure.severity === 'error' || failure.category === 'access'
        ? new RuntimeSessionFailureError(failure)
        : null;
}
