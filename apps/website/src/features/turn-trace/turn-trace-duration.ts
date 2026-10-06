/**
 * A step's duration for the trace's right-hand column. A settled leaf call
 * under a second is noise beside a 45s one, so it shows nothing; a running
 * step always shows its elapsed whole seconds so the clock visibly ticks.
 */
export function formatTraceDuration(
    durationMs: number | null,
    {
        isRunning = false,
        showSubsecond = false,
    }: { isRunning?: boolean; showSubsecond?: boolean } = {}
): string | null {
    if (durationMs === null) {
        return isRunning ? '0s' : null;
    }
    if (isRunning) {
        return formatSeconds(Math.floor(durationMs / 1000));
    }
    if (durationMs < 1000) {
        return showSubsecond && durationMs > 0 ? `${Math.round(durationMs)}ms` : null;
    }
    if (durationMs < 10_000) {
        return `${(durationMs / 1000).toFixed(1)}s`;
    }
    return formatSeconds(Math.round(durationMs / 1000));
}

function formatSeconds(total: number): string {
    if (total < 60) {
        return `${total}s`;
    }
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}
