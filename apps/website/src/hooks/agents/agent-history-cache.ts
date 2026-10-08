import type {
    AgentActivityEvent,
    AgentActivityHistoryInput,
    AgentActivityHistoryPage,
    AgentLifecycleEvent,
} from '@haus/api';
import type { Query, QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Keeps an Agent's durable history reads current from the Server shell's one
 * `agent.onActivity` and `agent.onLifecycle` streams, so a profile, the
 * Activity log, or a hover card never opens a subscription of its own.
 *
 * A committed activity event is exactly an Activity History row, so it is
 * written into every cached newest page that covers it rather than refetching
 * the page per event. A settled run is the one fact the event does not carry
 * (its turn summary), so settlement invalidates that Agent's turn reads once.
 * A websocket gap is reconciled by the App-wide reconnect invalidation; each
 * stream start also refreshes the Server's mounted history reads once
 * (`invalidateServerAgentHistory`), since the streams never replay.
 */
export function patchAgentActivityHistory(queryClient: QueryClient, event: AgentActivityEvent) {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: activityHistoryKey })) {
        const input = activityInputOf(query);
        if (!coversEvent(input, event)) {
            continue;
        }
        if (query.state.fetchStatus === 'fetching') {
            // A read in flight, first read included, may predate this event.
            rereadAfterFetch(queryClient, query);
            continue;
        }
        const page = query.state.data as AgentActivityHistoryPage | undefined;
        if (!page) {
            continue;
        }
        const next = insertActivityEvent(page, event);
        if (next === page) {
            continue;
        }
        queryClient.setQueryData(query.queryKey, next);
        if (!page.runTriggers.some((entry) => entry.runId === event.runId)) {
            // Only the Server quotes a run's trigger; read once to title a new run.
            void queryClient.invalidateQueries({ exact: true, queryKey: query.queryKey });
        }
    }
}

/**
 * The activity and lifecycle streams do not replay, so a (re)started stream
 * refreshes this Server's mounted history reads once. A window handoff or a
 * quick Server switch hydrates them fresh, and anything committed before the
 * subscription started would otherwise stay missing until the next settle.
 * Only mounted reads refetch; the rest refetch on their next mount.
 */
export function invalidateServerAgentHistory(queryClient: QueryClient, serverId: string) {
    const onServer = (query: Query) => activityInputOf(query)?.serverId === serverId;
    return Promise.all([
        queryClient.invalidateQueries({ predicate: onServer, queryKey: activityHistoryKey }),
        queryClient.invalidateQueries({
            predicate: onServer,
            queryKey: getQueryKey(hausTrpc.agent.turns, undefined, 'query'),
        }),
        queryClient.invalidateQueries({
            queryKey: getQueryKey(hausTrpc.agent.serverTurns, { serverId }, 'infinite'),
        }),
        queryClient.invalidateQueries({
            predicate: onServer,
            queryKey: getQueryKey(hausTrpc.stats.agentUsage, undefined, 'query'),
        }),
    ]);
}

/** A run settled: its turn summary is new, so the Agent's turn and usage reads refresh once. */
export function invalidateSettledAgentHistory(
    queryClient: QueryClient,
    event: Pick<AgentLifecycleEvent, 'agentId' | 'phase' | 'serverId'>
) {
    if (event.phase !== 'settled') {
        return Promise.resolve();
    }
    const scope = { agentId: event.agentId, serverId: event.serverId };
    return Promise.all([
        queryClient.invalidateQueries({
            queryKey: getQueryKey(hausTrpc.agent.turns, scope, 'query'),
        }),
        // Only newest pages: older pages hold settled runs that cannot change.
        queryClient.invalidateQueries({
            predicate: (query) => {
                const input = activityInputOf(query);
                return Boolean(input && sameAgent(input, event) && !input.before);
            },
            queryKey: activityHistoryKey,
        }),
        queryClient.invalidateQueries({
            queryKey: getQueryKey(
                hausTrpc.agent.serverTurns,
                { serverId: event.serverId },
                'infinite'
            ),
        }),
        queryClient.invalidateQueries({
            queryKey: getQueryKey(hausTrpc.stats.agentUsage, scope, 'query'),
        }),
    ]);
}

/**
 * Pages run newest first, each run's events newest first. A new run leads the
 * page; a known run takes the event in its own block. The page grows past its
 * limit and keeps its cursor: an older page is keyed after this page's original
 * last row, so trimming here would drop that row from every loaded page. A
 * reader that shows fewer rows trims at render time.
 */
export function insertActivityEvent(
    page: AgentActivityHistoryPage,
    event: AgentActivityEvent
): AgentActivityHistoryPage {
    if (page.events.some((candidate) => candidate.id === event.id)) {
        return page;
    }
    const events = [...page.events];
    const runStart = events.findIndex((candidate) => candidate.runId === event.runId);
    if (runStart === -1) {
        events.unshift(event);
    } else {
        let index = runStart;
        while (
            index < events.length &&
            events[index]?.runId === event.runId &&
            (events[index]?.position ?? 0) > event.position
        ) {
            index += 1;
        }
        events.splice(index, 0, event);
    }
    return { ...page, events };
}

/** The input a cached read was keyed by: the client's input, before Server defaults. */
type CachedActivityInput = Omit<AgentActivityHistoryInput, 'limit'> & { limit?: number };

const activityHistoryKey = getQueryKey(hausTrpc.agent.activityHistory, undefined, 'query');

/** Queries already waiting to read again once their in-flight read lands. */
const pendingRereads = new WeakSet<Query>();

/**
 * Marks the page stale once its in-flight read lands. Invalidating mid-read
 * would either cancel it (a steady event stream could starve it) or be cleared
 * by its success (an unobserved prefetch would keep the stale page). One
 * follow-up covers every event that arrived during the read.
 */
function rereadAfterFetch(queryClient: QueryClient, query: Query) {
    if (pendingRereads.has(query)) {
        return;
    }
    pendingRereads.add(query);
    const queryCache = queryClient.getQueryCache();
    const unsubscribe = queryCache.subscribe((cacheEvent) => {
        if (cacheEvent.query !== query) {
            return;
        }
        if (cacheEvent.type !== 'removed' && query.state.fetchStatus === 'fetching') {
            return;
        }
        unsubscribe();
        pendingRereads.delete(query);
        if (cacheEvent.type !== 'removed') {
            void queryClient.invalidateQueries({ exact: true, queryKey: query.queryKey });
        }
    });
}

function activityInputOf(query: Query): CachedActivityInput | null {
    const [, meta] = query.queryKey as [unknown, { input?: CachedActivityInput } | undefined];
    return meta?.input ?? null;
}

/** Newest pages of this Agent's history, or of the event's own run. */
function coversEvent(input: CachedActivityInput | null, event: AgentActivityEvent) {
    return Boolean(
        input &&
            sameAgent(input, event) &&
            !input.before &&
            (input.runId === undefined || input.runId === event.runId)
    );
}

function sameAgent(
    input: Pick<AgentActivityHistoryInput, 'agentId' | 'serverId'>,
    event: { agentId: string; serverId: string }
) {
    return input.agentId === event.agentId && input.serverId === event.serverId;
}
