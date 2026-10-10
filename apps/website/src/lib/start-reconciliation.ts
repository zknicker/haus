import type { Query, QueryCache, QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Subscription-start reconciliation (specs/realtime-events.md, "Recovery").
 * Nothing replays, so an event committed after a read's snapshot but before
 * its stream's subscription registered reaches neither. Every successful
 * focused start (first start, resubscribe after a socket reconnect, restart
 * after a failure) therefore refreshes that stream's owned reads, but only the
 * ones whose data, or whose fetch in flight, began before the start: a read
 * sent after the client heard `started` executes after the Server registered
 * the listener, so it cannot miss an event the stream would not deliver.
 *
 * Starts arrive as a burst after a reconnect; their invalidations wait out a
 * short settle window and flush once, each key judged against its latest start.
 */
export interface StartReconciliation {
    /** Applies every queued start invalidation now. */
    flush(): void;
    /**
     * While `recover` runs, `queue` answers the coalescer's invalidations
     * instead of the frame queue. Returns false when no start is running.
     */
    queue(filters: { exact: boolean; queryKey: QueryKey }): boolean;
    /** Runs a stream's owned-read recovery for the start that just happened. */
    run(recover: () => void): void;
}

/** A start burst after a reconnect lands within a few ms; wait this long after the last start. */
export const startSettleMs = 50;
/** Never hold a start's recovery longer than this behind later starts. */
export const startSettleMaxMs = 250;

export function createStartReconciliation(queryClient: QueryClient): StartReconciliation {
    const marks = readStartMarks(queryClient);
    const queued = new Map<string, { exact: boolean; mark: number; queryKey: QueryKey }>();
    let running: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstQueuedAt = 0;

    const flush = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        const batch = [...queued.values()];
        queued.clear();
        for (const { exact, mark, queryKey } of batch) {
            const predates = (query: Query) => marks.predates(query, mark);
            // Cancel first: a read with no data yet would otherwise answer the
            // invalidation with its own pre-start fetch.
            void queryClient
                .cancelQueries({
                    exact,
                    predicate: (query) => predates(query) && query.state.fetchStatus !== 'idle',
                    queryKey,
                })
                .then(() =>
                    queryClient.invalidateQueries({
                        exact,
                        predicate: predates,
                        queryKey,
                        refetchType: 'active',
                    })
                );
        }
    };

    return {
        flush,
        queue: ({ exact, queryKey }) => {
            if (running === null) {
                return false;
            }
            // A later start's mark covers every read an earlier one would refresh.
            queued.set(`${exact ? '=' : '^'}${JSON.stringify(queryKey)}`, {
                exact,
                mark: running,
                queryKey,
            });
            return true;
        },
        run: (recover) => {
            const mark = marks.mark();
            running = mark;
            try {
                recover();
            } finally {
                running = null;
            }
            if (queued.size === 0) {
                return;
            }
            const now = Date.now();
            if (timer === null) {
                firstQueuedAt = now;
            } else {
                clearTimeout(timer);
            }
            const wait = Math.min(
                startSettleMs,
                Math.max(0, firstQueuedAt + startSettleMaxMs - now)
            );
            timer = setTimeout(flush, wait);
        },
    };
}

/**
 * When each cached read's data was fetched relative to subscription starts.
 * A start takes a mark; `predates` says whether the query's data, or its
 * fetch in flight, began before that mark.
 */
export interface ReadStartMarks {
    mark(): number;
    predates(query: Query, mark: number): boolean;
}

const installed = new WeakMap<QueryClient, ReadStartMarks>();

/** The client's marks, installed on first use; install before any read for exact skips. */
export function readStartMarks(queryClient: QueryClient): ReadStartMarks {
    let marks = installed.get(queryClient);
    if (!marks) {
        marks = createReadStartMarks(queryClient.getQueryCache());
        installed.set(queryClient, marks);
    }
    return marks;
}

/**
 * Fetch begins come from the cache's `fetch` action. A refetch that cancels
 * one in flight dispatches none, so its begin reads as the older fetch's; an
 * untracked read (hydrated, seeded, or fetched before install) reads as
 * before every mark. Each error leans toward refetching, never skipping.
 */
function createReadStartMarks(cache: QueryCache): ReadStartMarks {
    let epoch = 0;
    const fetchBegan = new WeakMap<Query, number>();
    const dataBegan = new WeakMap<Query, number>();
    cache.subscribe((event) => {
        if (event.type !== 'updated') {
            return;
        }
        const { action, query } = event;
        if (action.type === 'fetch') {
            // Loading another page refreshes none of the pages already loaded.
            if (!isFetchMore(action.meta)) {
                fetchBegan.set(query, epoch);
            }
        } else if (action.type === 'success' && !action.manual) {
            const began = fetchBegan.get(query);
            if (began !== undefined) {
                dataBegan.set(query, began);
            }
        }
    });
    return {
        mark: () => {
            epoch += 1;
            return epoch;
        },
        predates: (query, mark) => {
            const began = query.state.fetchStatus === 'idle' ? dataBegan : fetchBegan;
            return (began.get(query) ?? 0) < mark;
        },
    };
}

function isFetchMore(meta: unknown) {
    return typeof meta === 'object' && meta !== null && 'fetchMore' in meta;
}
