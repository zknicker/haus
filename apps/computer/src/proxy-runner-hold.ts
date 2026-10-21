/**
 * Holds an Agent's `haus` requests that arrive between Haus turns while a wake run is on its way.
 * Claude Code starts a turn on its own to report finished background work; the Computer asks
 * the Server for the run that owns it, and until that run's runner token arrives the model's
 * calls wait here instead of failing as `AGENT_IDLE` (specs/runtime-drivers.md "Background
 * work"). A hold that runs out lets the request through to that idle refusal.
 */
export function createRunnerHold() {
    let until = 0;
    const waiters = new Set<() => void>();
    return {
        hold(ms: number): void {
            until = Math.max(until, Date.now() + ms);
        },
        /** A runner token arrived: every held request proceeds. */
        release(): void {
            until = 0;
            for (const wake of [...waiters]) {
                wake();
            }
        },
        async wait(): Promise<void> {
            const remaining = until - Date.now();
            if (remaining <= 0) {
                return;
            }
            await new Promise<void>((resolve) => {
                const done = () => {
                    clearTimeout(timer);
                    waiters.delete(done);
                    resolve();
                };
                const timer = setTimeout(done, remaining);
                waiters.add(done);
            });
        },
    };
}
