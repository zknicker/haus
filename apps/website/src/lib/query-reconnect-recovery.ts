import type { Query, QueryClient } from '@tanstack/react-query';
// Type-only: haus-server.tsx imports this module, and the coalescer imports haus-server.tsx.
import type { TargetedReadCoalescer } from './targeted-read-coalescer.ts';

export type ConnectionState = 'connected' | 'connecting' | 'reconnecting';

/** Reconciles active durable reads after a websocket gap, never on the initial connection. */
export function createQueryReconnectHandler({
    onReconnect,
    onStateChange,
}: {
    onReconnect: () => void;
    onStateChange: (state: ConnectionState) => void;
}) {
    let hasConnected = false;

    return (state: ConnectionState) => {
        onStateChange(state);
        if (state !== 'connected') {
            return;
        }
        if (hasConnected) {
            onReconnect();
            return;
        }
        hasConnected = true;
    };
}

/**
 * Volatile streams whose live projection re-reads its durable state on every
 * start, a reconnect included (specs/realtime-events.md, "Recovery"). The
 * reconnect pass skips their reads, or each would refetch twice. Root streams
 * own no reads here: they do not recover on a plain reconnect start.
 */
export const streamRecoveredReads = {
    'agent.onActivity': [
        'agent.activeActivity',
        'agent.activityHistory',
        'agent.serverTurns',
        'agent.turns',
        'stats.agentUsage',
    ],
    'agent.onLifecycle': ['agent.get', 'agent.list'],
    'chat.onEngagement': ['chat.engagements'],
} as const satisfies Record<string, readonly string[]>;

/** Reads whose answer never changes once read, so a gap cannot have staled them. */
const settledReads = ['agent.executionJournal'] as const;

const skippedProcedures: ReadonlySet<string> = new Set([
    ...Object.values(streamRecoveredReads).flat(),
    ...settledReads,
]);

/**
 * The App-wide reconnect pass: one refetch of every active Server read, once.
 * Transcript lists recover in bulk through the coalescer (each loaded page
 * reseeds its entities; inactive lists are only marked stale), and the
 * `chat.message` family never joins: entities recover only through their
 * lists.
 */
export function recoverAfterReconnect(
    queryClient: QueryClient,
    coalescer: Pick<TargetedReadCoalescer, 'recoverTranscriptLists'>
) {
    const listServers = new Set<string>();
    for (const query of queryClient.getQueryCache().getAll()) {
        const serverId = transcriptListServerId(query);
        if (serverId !== null) {
            listServers.add(serverId);
        }
    }
    for (const serverId of listServers) {
        coalescer.recoverTranscriptLists({ serverId });
    }
    return queryClient.invalidateQueries({
        predicate: isReconnectRecoveredQuery,
        refetchType: 'active',
    });
}

/**
 * Whether the generic reconnect pass refetches this query: a Server tRPC read
 * that is not a transcript list (recovered in bulk), a `chat.message` entity,
 * a volatile stream's own read, or a settled read. Queries outside tRPC
 * (update checks, turn outlines) are not Server state a socket gap can stale.
 */
export function isReconnectRecoveredQuery(query: Pick<Query, 'queryKey'>): boolean {
    const path = query.queryKey[0];
    if (!(Array.isArray(path) && path.every((part) => typeof part === 'string'))) {
        return false;
    }
    const name = path.join('.');
    if (name === 'chat.message' || transcriptListServerId(query) !== null) {
        return false;
    }
    return !skippedProcedures.has(name);
}

/**
 * The Server of a transcript list (a `chat.messages` infinite query), else
 * null. Read from the key shape, the same one `transcriptListInput` reads.
 */
function transcriptListServerId(query: Pick<Query, 'queryKey'>): string | null {
    const [path, options] = query.queryKey as [unknown, { input?: unknown; type?: unknown }?];
    const input = options?.input as { serverId?: unknown } | undefined;
    return Array.isArray(path) &&
        path[0] === 'chat' &&
        path[1] === 'messages' &&
        options?.type === 'infinite' &&
        typeof input?.serverId === 'string'
        ? input.serverId
        : null;
}
