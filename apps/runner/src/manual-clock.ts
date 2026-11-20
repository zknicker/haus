import type { InvocationClock } from './invocations/invocation-clock.ts';

export function manualClock() {
    const scheduled: { callback: () => void; cancelled: boolean; dueAt: number }[] = [];
    let now = 0;
    const clock: InvocationClock = {
        schedule(callback, delayMs) {
            const timer = { callback, cancelled: false, dueAt: now + delayMs };
            scheduled.push(timer);
            return { cancel: () => (timer.cancelled = true) };
        },
    };
    return {
        advance(ms: number) {
            now += ms;
            for (const timer of scheduled.filter(
                (candidate) => !candidate.cancelled && candidate.dueAt <= now
            )) {
                timer.cancelled = true;
                timer.callback();
            }
        },
        clock,
    };
}
