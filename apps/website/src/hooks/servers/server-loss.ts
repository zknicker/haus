import { type Query, type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { TargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';

/**
 * The Server-loss path (specs/realtime-events.md, "Refusal classes"): a
 * stream ended with `hausRefusal: 'membership_lost'`. Idempotent per Server,
 * in order:
 *
 * 1. Close every stream of that Server client-side (`useServerStreamsOpen`).
 * 2. Abort the coalescer's tail reads and recoveries, and drop its transcript
 *    lists and `chat.message` entities.
 * 3. Cancel, then drop, every other query scoped to the Server.
 *
 * Dropping, not invalidating, is the point: stale data stays readable while a
 * refetch runs or offline, and a removed human must stop seeing the Server. A
 * scoped query that a mounted view still observes is reset instead of removed,
 * so that view reads again and fails closed (the route's unavailable state);
 * a removed query would keep rendering its old data until something
 * re-rendered it.
 */
export async function runServerLoss({
    coalescer,
    queryClient,
    serverId,
}: {
    coalescer: Pick<TargetedReadCoalescer, 'purgeServer'>;
    queryClient: QueryClient;
    serverId: string;
}) {
    if (!markServerLost(queryClient, serverId)) {
        return;
    }
    await coalescer.purgeServer({ serverId });
    await dropQueries(queryClient, (query) => isServerScopedQuery(query, serverId));
    await queryClient.invalidateQueries({ queryKey: [['server', 'list']] });
}

/**
 * Cancels, then drops, the matching queries: observed ones reset (their views
 * refetch and fail closed), unobserved ones are removed. The set is taken
 * first: `server.bySlug` matches by cached data, which a reset clears.
 */
async function dropQueries(queryClient: QueryClient, matches: (query: Query) => boolean) {
    const dropped = new Set(queryClient.getQueryCache().findAll({ predicate: matches }));
    const predicate = (query: Query) => dropped.has(query);
    await queryClient.cancelQueries({ predicate });
    await queryClient.resetQueries({
        predicate: (query) => predicate(query) && query.getObserversCount() > 0,
    });
    queryClient.removeQueries({
        predicate: (query) => predicate(query) && query.getObserversCount() === 0,
    });
}

/**
 * The Chat-loss purge (`chat.onLifecycle` `deleted`): the coalescer drops the
 * Chat's transcript lists, entities, tails, pending rows, and kept views, then
 * every other read scoped to the Chat (its record, work list, engagements) is
 * cancelled and dropped the same way as a Server loss: a mounted view resets
 * and fails closed instead of rendering the deleted Chat from cache.
 */
export async function runChatLoss({
    chatId,
    coalescer,
    queryClient,
    serverId,
}: {
    chatId: string;
    coalescer: Pick<TargetedReadCoalescer, 'purgeChat'>;
    queryClient: QueryClient;
    serverId: string;
}) {
    await coalescer.purgeChat({ chatId, serverId });
    await dropQueries(queryClient, (query) => {
        const input = (query.queryKey[1] as { input?: Record<string, unknown> } | undefined)?.input;
        return input?.serverId === serverId && input.chatId === chatId;
    });
}

/** The loss path bound to the mounted App's caches. */
export function useServerLoss(): (serverId: string) => void {
    const queryClient = useQueryClient();
    const coalescer = useTargetedReadCoalescer();
    return React.useCallback(
        (serverId: string) => {
            void runServerLoss({ coalescer, queryClient, serverId });
        },
        [coalescer, queryClient]
    );
}

/** False once the Server was lost: every stream of it stays closed. */
export function useServerStreamsOpen(serverId: string | undefined): boolean {
    const queryClient = useQueryClient();
    const store = lossStore(queryClient);
    return React.useSyncExternalStore(
        store.subscribe,
        () => serverId === undefined || !store.lost.has(serverId),
        () => true
    );
}

/**
 * A lost Server listed again by a `server.list` read newer than the loss (the
 * human was re-invited) may open its streams again.
 */
export function forgiveRelistedServers(
    queryClient: QueryClient,
    listedServerIds: readonly string[],
    listedAt: number
) {
    const store = lossStore(queryClient);
    let changed = false;
    for (const serverId of listedServerIds) {
        const lostAt = store.lost.get(serverId);
        if (lostAt !== undefined && listedAt > lostAt) {
            store.lost.delete(serverId);
            changed = true;
        }
    }
    if (changed) {
        store.emit();
    }
}

/** tRPC reads that are never one Server's data, whatever their input. */
export const globalReadNamespaces = ['cloudAgentProvider', 'dev', 'push', 'session'] as const;
export const globalReads = ['server.list'] as const;

/**
 * Whether a cached query is scoped to `serverId`: a tRPC read whose input
 * names the Server, `server.bySlug` (keyed by slug only) whose cached result
 * is that Server, or an App key that embeds the Server id. Global reads (the
 * Server list, account and session reads) never match.
 */
export function isServerScopedQuery(
    query: { queryKey: QueryKey; state: { data?: unknown } },
    serverId: string
) {
    const [path, options] = query.queryKey as [unknown, unknown];
    if (!(Array.isArray(path) && path.every((part) => typeof part === 'string'))) {
        return query.queryKey.includes(serverId);
    }
    const name = path.join('.');
    if (
        (globalReads as readonly string[]).includes(name) ||
        (globalReadNamespaces as readonly string[]).includes(path[0] ?? '')
    ) {
        return false;
    }
    if (name === 'server.bySlug') {
        return (query.state.data as { id?: unknown } | undefined)?.id === serverId;
    }
    const input = (options as { input?: { serverId?: unknown } } | undefined)?.input;
    return input?.serverId === serverId;
}

interface LossStore {
    emit(): void;
    /** Lost Server id → when it was lost. */
    lost: Map<string, number>;
    subscribe(listener: () => void): () => void;
}

const stores = new WeakMap<QueryClient, LossStore>();

function markServerLost(queryClient: QueryClient, serverId: string): boolean {
    const store = lossStore(queryClient);
    if (store.lost.has(serverId)) {
        return false;
    }
    store.lost.set(serverId, Date.now());
    store.emit();
    return true;
}

function lossStore(queryClient: QueryClient): LossStore {
    let store = stores.get(queryClient);
    if (!store) {
        const listeners = new Set<() => void>();
        store = {
            emit: () => {
                for (const listener of listeners) {
                    listener();
                }
            },
            lost: new Map(),
            subscribe: (listener) => {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
        };
        stores.set(queryClient, store);
    }
    return store;
}
