/** How long a runtime's startup handshake may take before the open fails and the process ends. */
export const RUNTIME_HANDSHAKE_TIMEOUT_MS = 60_000;

/** A runtime process answered too slowly while its session was opening. */
export class RuntimeHandshakeTimeoutError extends Error {
    constructor(runtimeLabel: string, ms: number) {
        super(`${runtimeLabel} did not finish its startup handshake within ${ms / 1000}s.`);
        this.name = 'RuntimeHandshakeTimeoutError';
    }
}

export interface HandshakeDeadline {
    clear(): void;
    /** Aborts on the caller's cancellation or when the handshake runs out of time. */
    readonly signal: AbortSignal;
}

/**
 * Bounds one runtime's startup handshake: the open's own cancellation (the startup deadline,
 * Stop, shutdown) or the handshake timeout, whichever comes first. A timeout is a startup
 * failure, never a resume rejection.
 */
export function handshakeDeadline(
    runtimeLabel: string,
    parent: AbortSignal | undefined,
    ms = RUNTIME_HANDSHAKE_TIMEOUT_MS
): HandshakeDeadline {
    const controller = new AbortController();
    const onParentAbort = () => controller.abort(parent?.reason);
    if (parent?.aborted) {
        onParentAbort();
    } else {
        parent?.addEventListener('abort', onParentAbort, { once: true });
    }
    const timer = setTimeout(
        () => controller.abort(new RuntimeHandshakeTimeoutError(runtimeLabel, ms)),
        ms
    );
    return {
        clear() {
            clearTimeout(timer);
            parent?.removeEventListener('abort', onParentAbort);
        },
        signal: controller.signal,
    };
}
