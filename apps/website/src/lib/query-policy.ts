import type { DefaultOptions, Query } from '@tanstack/react-query';
import { shouldRetryQuery } from './query-retry.ts';

const THIRTY_SECONDS_MS = 30_000;
const FIVE_MINUTES_MS = 5 * 60_000;
const THIRTY_MINUTES_MS = 30 * 60_000;

/**
 * How old an active read must be before showing or focusing the window
 * refetches it (specs/realtime-events.md, "Recovery"). A quick alt-tab is
 * silent; returning after longer catches whatever a dropped event missed.
 */
export const focusStaleWindowMs = 3 * 60_000;

/**
 * Mount refetch stays at the React Query default (refetch only when stale).
 * Never set `refetchOnMount: false` on a query that unmounts with navigation:
 * events invalidate inactive queries without refetching them, so a remount is
 * exactly when a stale-marked query must be allowed to refetch. With the
 * staleTimes below, a mount refetch happens only after an event marked the
 * data stale or the window lapsed — not on every mount.
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
     * A Server read that events keep current. Events notify; React Query owns
     * recovery: a stream restart, the socket reconnect pass, the window focus
     * pass, and this staleness floor on mount each refetch it.
     */
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
        refetchOnWindowFocus: refetchesOnFocus,
        retry: shouldRetryQuery,
        staleTime: THIRTY_SECONDS_MS,
    },
} satisfies DefaultOptions;

/**
 * The window focus pass: an active Server read refetches on focus only when
 * its data is older than the focus stale window. `chat.message` entities never
 * refetch on focus (their family defaults turn it off); transcript lists
 * refetch their loaded pages, which reseeds their entities in bulk.
 */
export function refetchesOnFocus(query: Pick<Query, 'queryKey' | 'state'>, now = Date.now()) {
    const [path] = query.queryKey;
    if (!(Array.isArray(path) && path.every((part) => typeof part === 'string'))) {
        return false;
    }
    return now - query.state.dataUpdatedAt > focusStaleWindowMs;
}
