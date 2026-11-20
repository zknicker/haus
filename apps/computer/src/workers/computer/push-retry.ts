export type Schedule = (delayMs: number, run: () => void) => () => void;

const backoffMs = [5000, 30_000, 120_000] as const;
const steadyMs = 600_000;

export const timerSchedule: Schedule = (delayMs, run) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
};

export class PushRetry {
    private readonly released = new AbortController();
    private wake: (() => void) | null = null;

    constructor(private readonly schedule: Schedule) {}

    async run(pushed: () => Promise<boolean>) {
        for (let attempt = 0; await this.waitFor(backoffMs[attempt] ?? steadyMs); attempt += 1) {
            if (await pushed()) {
                return;
            }
        }
    }

    now() {
        this.wake?.();
    }

    release() {
        this.released.abort();
    }

    private waitFor(delayMs: number) {
        const { signal } = this.released;
        return new Promise<boolean>((resolve) => {
            if (signal.aborted) {
                resolve(false);
                return;
            }
            const settle = (again: boolean) => {
                this.wake = null;
                signal.removeEventListener('abort', onRelease);
                resolve(again);
            };
            const cancel = this.schedule(delayMs, () => settle(true));
            const onRelease = () => {
                cancel();
                settle(false);
            };
            this.wake = () => {
                cancel();
                settle(true);
            };
            signal.addEventListener('abort', onRelease, { once: true });
        });
    }
}
