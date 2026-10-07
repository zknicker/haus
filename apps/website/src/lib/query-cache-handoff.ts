import {
    type DehydratedState,
    defaultShouldDehydrateQuery,
    dehydrate,
    hydrate,
    type Query,
    type QueryClient,
} from '@tanstack/react-query';
import * as React from 'react';
import { getDesktopClerkUserId } from './clerk.tsx';
import { getDesktopBridge } from './desktop-bridge.ts';

/**
 * A window opened from another starts with a copy of its opener's query cache
 * (docs/internals/app.md, "Window cache handoff"). Electron carries it by
 * structured clone, in memory only (electron/query-cache-handoff.cjs).
 */
export interface QueryCacheHandoff {
    state: DehydratedState;
    userId: string;
}

/** Larger caches are not handed off at all; the new window loads normally. */
export const maxHandoffBytes = 4 * 1024 * 1024;

// Reads keyed by one-time codes or invitation tokens: an auth flow's own state.
// Execution journals are large evidence a window reads for itself; copying
// them would push the handoff past `maxHandoffBytes` and drop it entirely.
const unsharedProcedures: readonly (readonly string[])[] = [
    ['agent', 'executionJournal'],
    ['computer', 'login'],
    ['invitation'],
];

/**
 * The one rule for what a new window may copy: settled Server reads (tRPC query
 * keys) only. App-local caches (update checks, presence probes) run their own
 * side effects, and a read that opts out of mount refetch (`queryPolicy.volatileState`)
 * is kept current by this window's live subscription, so a copy would go stale.
 */
export function isShareableQuery(query: Query): boolean {
    const path = trpcPath(query.queryKey);
    return (
        path !== null &&
        defaultShouldDehydrateQuery(query) &&
        // A query holds its latest observer's options; the core type omits observer fields.
        (query.options as { refetchOnMount?: unknown }).refetchOnMount !== false &&
        !unsharedProcedures.some((prefix) => prefix.every((part, index) => path[index] === part))
    );
}

/** This window's shareable cache, or null without a user or over `maxBytes`. */
export function packQueryCacheHandoff(
    client: QueryClient,
    userId: string | null,
    maxBytes = maxHandoffBytes
): QueryCacheHandoff | null {
    if (!userId) {
        return null;
    }
    const state = dehydrate(client, {
        shouldDehydrateMutation: () => false,
        shouldDehydrateQuery: isShareableQuery,
    });
    return estimatedBytes(state) <= maxBytes ? { state, userId } : null;
}

/**
 * Seeds a fresh client with a handed-off cache for the same user. The copy
 * renders at once but counts as stale, so every read refetches when it mounts
 * and picks up whatever changed while this window booted.
 */
export function hydrateQueryCacheHandoff(
    client: QueryClient,
    handoff: QueryCacheHandoff | null,
    userId: string | null
): boolean {
    if (!(handoff && userId && handoff.userId === userId)) {
        return false;
    }
    hydrate(client, handoff.state);
    void client.invalidateQueries({ refetchType: 'none' });
    return true;
}

export function parseQueryCacheHandoff(value: unknown): QueryCacheHandoff | null {
    if (!(value && typeof value === 'object' && 'userId' in value && 'state' in value)) {
        return null;
    }
    const { state, userId } = value as { state: unknown; userId: unknown };
    const valid =
        typeof userId === 'string' &&
        state !== null &&
        typeof state === 'object' &&
        Array.isArray((state as DehydratedState).queries) &&
        Array.isArray((state as DehydratedState).mutations);
    return valid ? { state: state as DehydratedState, userId } : null;
}

let claimed: QueryCacheHandoff | null | undefined;

/**
 * Hydrates the cache this window opened with, if any. Electron hands it over
 * once per page load; StrictMode may build the client twice, so the claim is
 * kept for the page.
 */
export function hydrateClaimedQueryCache(client: QueryClient): void {
    if (claimed === undefined) {
        try {
            claimed = parseQueryCacheHandoff(getDesktopBridge()?.queryCacheClaim?.() ?? null);
        } catch (error) {
            console.warn('[Haus] Could not claim the opener query cache.', error);
            claimed = null;
        }
    }
    hydrateQueryCacheHandoff(client, claimed, getDesktopClerkUserId());
}

/** Answers Electron when a window this one opens asks for a copy of the cache. */
export function useQueryCacheOffer(client: QueryClient): void {
    React.useEffect(
        () =>
            getDesktopBridge()?.onQueryCacheRequest?.(() =>
                packQueryCacheHandoff(client, getDesktopClerkUserId())
            ),
        [client]
    );
}

/** tRPC v11 keys are `[path[], { input?, type }]`; anything else is App-local. */
function trpcPath(queryKey: readonly unknown[]): readonly string[] | null {
    const [path, meta] = queryKey;
    const isTrpc =
        queryKey.length === 2 &&
        Array.isArray(path) &&
        path.every((part) => typeof part === 'string') &&
        meta !== null &&
        typeof meta === 'object' &&
        'type' in meta;
    return isTrpc ? (path as string[]) : null;
}

/** JSON length as a size estimate; a value JSON cannot carry (BigInt) skips the handoff. */
function estimatedBytes(state: DehydratedState): number {
    try {
        return JSON.stringify(state).length;
    } catch {
        return Number.POSITIVE_INFINITY;
    }
}
