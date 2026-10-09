import type { DefaultOptions } from '@tanstack/react-query';
import { shouldRetryQuery } from './query-retry.ts';

const THIRTY_SECONDS_MS = 30_000;
const FIVE_MINUTES_MS = 5 * 60_000;
const THIRTY_MINUTES_MS = 30 * 60_000;

/**
 * Mount refetch stays at the React Query default (refetch only when stale).
 * Never set `refetchOnMount: false` on a query that unmounts with navigation:
 * server events invalidate inactive queries without refetching them, so a
 * remount is exactly when a stale-marked query must be allowed to refetch.
 * With the staleTimes below, a mount refetch happens only after an event
 * marked the data stale or the window lapsed — not on every mount.
 */
const stableQueryPolicy = {
    gcTime: THIRTY_MINUTES_MS,
} as const;

export const queryPolicy = {
    localConfig: {
        ...stableQueryPolicy,
        staleTime: FIVE_MINUTES_MS,
    },
    computerSnapshot: {
        ...stableQueryPolicy,
        staleTime: THIRTY_SECONDS_MS,
    },
    /**
     * A read whose every change reaches the App as a realtime event the App
     * listens to, and whose stream recovers it after a gap. Events keep the
     * cache exact, so a timer never stales it: a remount refetches only after
     * an event (or a stream's recovery) invalidated it. `Infinity`, never
     * `'static'`, so invalidation still works. Only reads in
     * `pushedSnapshotCoverage` (lib/pushed-snapshot-coverage.ts) may use it,
     * each naming the events that cover it.
     */
    pushedSnapshot: {
        ...stableQueryPolicy,
        staleTime: Number.POSITIVE_INFINITY,
    },
    syncedSnapshot: {
        ...stableQueryPolicy,
        staleTime: THIRTY_SECONDS_MS,
    },
    volatileState: {
        refetchOnMount: false,
        staleTime: 0,
    },
} as const;

/**
 * The floor both tRPC clients share. A named `queryPolicy` preset is the norm:
 * a query that knows what it reads declares its own freshness and mount
 * behavior. This default only keeps a one-off query from refetching on every
 * mount, so `staleTime` is the one thing it states. `refetchOnMount` stays at
 * its default here, which means an unpoliced query still refreshes when a mount
 * finds it stale, just no more than once per window.
 */
export const queryClientDefaultOptions = {
    queries: {
        // Browser offline → online is not a recovery signal for Server reads:
        // the socket reconnect that follows owns that (query-reconnect-recovery.ts).
        // Refetching here too ran every active read before the socket was back.
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
        staleTime: THIRTY_SECONDS_MS,
    },
} satisfies DefaultOptions;
