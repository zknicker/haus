import * as React from 'react';
import { formatRelativeTime } from '../../lib/format.ts';

export function useRelativeNow(intervalMs = 30_000) {
    const [now, setNow] = React.useState(() => Date.now());

    React.useEffect(() => {
        const interval = window.setInterval(() => {
            setNow(Date.now());
        }, intervalMs);

        return () => {
            window.clearInterval(interval);
        };
    }, [intervalMs]);

    return now;
}

export function RelativeTime({
    fallback,
    value,
}: {
    fallback?: string;
    value: null | string | undefined;
}) {
    const now = useRelativeNow();

    return <>{value ? formatRelativeTime(value, now) : (fallback ?? 'unknown')}</>;
}
