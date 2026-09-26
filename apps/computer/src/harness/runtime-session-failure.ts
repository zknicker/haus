/**
 * codex-acp reports provider failures as typed JetBrains AIR session failures once the client
 * advertises this capability: one `session_info_update` per retry warning, and the terminal
 * failure on the prompt response's `_meta`. Without it the failure arrives as assistant text
 * beside an ordinary `end_turn`, which Haus would settle as a silent success.
 */
export const typedSessionFailureClientCapabilities = {
    _meta: { jetbrains: { air: { capabilities: ['sessionFailure'], version: 1 } } },
};

export interface RuntimeSessionFailure {
    /** codex-acp's policy category: `access` is a rejected credential. */
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
export function fatalRuntimeSessionFailure(rawValue: unknown): RuntimeSessionFailureError | null {
    const failure = readRuntimeSessionFailure(rawValue);
    if (!failure) {
        return null;
    }
    // Only a retry's category carries the HTTP status; its title is just "Reconnecting... n/5".
    return failure.severity === 'error' || failure.category === 'access'
        ? new RuntimeSessionFailureError(failure)
        : null;
}

export function readRuntimeSessionFailure(rawValue: unknown): RuntimeSessionFailure | null {
    const failure = field(
        field(field(field(rawValue, '_meta'), 'jetbrains'), 'air'),
        'sessionFailure'
    );
    const category = field(failure, 'category');
    const severity = field(failure, 'severity');
    const title = field(failure, 'title');
    if (
        typeof category !== 'string' ||
        (severity !== 'error' && severity !== 'warning') ||
        typeof title !== 'string'
    ) {
        return null;
    }
    return { category, severity, title };
}

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)[key]
        : undefined;
}
