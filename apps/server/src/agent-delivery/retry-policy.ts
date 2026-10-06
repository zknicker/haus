interface BackoffSchedule {
    baseMs: number;
    capMs: number;
}

const failureBackoff: BackoffSchedule = { baseMs: 5000, capMs: 60_000 };
// A usage limit can last hours: back off longer and never count it as a failure.
const rateLimitBackoff: BackoffSchedule = { baseMs: 10_000, capMs: 5 * 60_000 };
const jitterRatio = 0.1;

/** The short window before a counted failure's next automatic wake. */
export function failureBackoffMs(attempt: number, random: () => number = Math.random): number {
    return backoffMs(failureBackoff, attempt, random);
}

/** The window before a rate-limited Agent's next automatic wake. */
export function rateLimitBackoffMs(attempt: number, random: () => number = Math.random): number {
    return backoffMs(rateLimitBackoff, attempt, random);
}

/** Automatic dispatch waits while `retry_after` is in the future, paused or not. */
export function isBackedOff(state: { retryAfter: Date | null }, now = Date.now()): boolean {
    return state.retryAfter !== null && state.retryAfter.getTime() > now;
}

function backoffMs(schedule: BackoffSchedule, attempt: number, random: () => number) {
    const capped = Math.min(schedule.capMs, schedule.baseMs * 2 ** Math.max(0, attempt - 1));
    const unit = Math.max(0, Math.min(1, random()));
    return Math.min(schedule.capMs, capped + Math.floor(capped * jitterRatio * unit));
}
