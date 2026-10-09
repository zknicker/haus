import type { Query } from '@tanstack/react-query';

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
 * The Server reads each event stream recovers on its own when it (re)starts
 * (docs/api/realtime.md, "Reconnect Recovery"). A websocket reconnect restarts
 * every stream, so each listed read already has exactly one recovery owner:
 *
 * - `chat.onEvent` walks `chat.events` from its cursor and invalidates only
 *   what the missed events touched (the whole Chat snapshot without a cursor).
 * - `chat.onEngagement` re-reads `chat.engagements`.
 * - `agent.onLifecycle` re-reads the Agent list and Agent details.
 * - `agent.onActivity` re-reads current activity, Activity History, turns, and
 *   usage.
 *
 * The App-wide reconnect pass skips them, or every one would refetch twice.
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
    'chat.onEvent': [
        'agent.chats',
        'chat.eventHead',
        'chat.events',
        'chat.get',
        'chat.list',
        'chat.listArchived',
        'chat.messages',
        'chat.search',
        'cloudAgentWork.listActive',
        'cloudAgentWork.listForChat',
        'task.list',
        'taskLabel.list',
    ],
} as const satisfies Record<string, readonly string[]>;

/** Reads whose answer never changes once read, so a gap cannot have staled them. */
const settledReads = ['agent.executionJournal'] as const;

const skippedProcedures: ReadonlySet<string> = new Set([
    ...Object.values(streamRecoveredReads).flat(),
    ...settledReads,
]);

/**
 * Whether the App-wide reconnect pass refetches this query: a Server tRPC
 * read that no event stream recovers. `server.onUpdate` is one such stream —
 * it neither replays nor catches up, so its Server, member, Computer, MCP, and
 * settings reads recover here, as do reads with no stream at all (reminders,
 * triggers, delivery state). Queries outside tRPC (update checks, presence
 * probes) are not Server state a socket gap can stale; their own policies own
 * when they refetch.
 */
export function isReconnectRecoveredQuery(query: Pick<Query, 'queryKey'>): boolean {
    const path = query.queryKey[0];
    if (!(Array.isArray(path) && path.every((part) => typeof part === 'string'))) {
        return false;
    }
    return !skippedProcedures.has(path.join('.'));
}
