import * as React from 'react';

const tickMs = 1000;

/**
 * The clock a live trace re-derives its elapsed times from. It ticks only
 * while the turn runs; a settled trace never re-renders on a timer.
 */
export function useTurnTraceNow(isRunning: boolean): number {
    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        if (!isRunning) {
            return;
        }
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), tickMs);
        return () => window.clearInterval(interval);
    }, [isRunning]);

    return now;
}
