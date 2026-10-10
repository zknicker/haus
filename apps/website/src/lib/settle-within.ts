/** A bounded step that ran past its bound. */
export class UnsettledError extends Error {
    constructor(what: string, ms: number) {
        super(`${what} did not settle within ${ms} ms`);
        this.name = 'UnsettledError';
    }
}

/**
 * Runs `work` under a signal that aborts with `parent` or after `ms`. Past
 * `ms` it rejects with `UnsettledError` even if `work` never settles, so a
 * wedged read cannot hold whatever awaits it forever.
 */
export function settleWithin<T>(
    what: string,
    parent: AbortSignal,
    ms: number,
    work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    parent.addEventListener('abort', abort, { once: true });
    if (parent.aborted) {
        controller.abort();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new UnsettledError(what, ms));
            controller.abort();
        }, ms);
    });
    return Promise.race([work(controller.signal), expired]).finally(() => {
        clearTimeout(timer);
        parent.removeEventListener('abort', abort);
    });
}
