import type { ServerDurableEvent, ServerUpdateScope } from '@haus/api';
import type { streamRecoveredReads } from './query-reconnect-recovery.ts';

/** A realtime event an App listener turns into an update or invalidation of the read. */
export type CoveringEvent = ServerDurableEvent['type'] | `server.updated:${ServerUpdateScope}`;

export interface PushedSnapshotCoverage {
    /** Every event whose listener refreshes this exact read. */
    events: readonly CoveringEvent[];
    /** The source files allowed to read it with `queryPolicy.pushedSnapshot`. */
    files: readonly string[];
    /**
     * The streams whose (re)start recovers the read after a gap, one per kind
     * of covering event (`streamRecoveredReads`).
     */
    recovery: readonly (keyof typeof streamRecoveredReads)[];
}

/**
 * The Server reads proven fully event-covered: every Server write that changes
 * what the read returns emits one of `events`, whose App listener invalidates
 * or updates this read's key, and `recovery` re-reads it after a socket gap.
 * Only these reads may use `queryPolicy.pushedSnapshot` (staleTime Infinity);
 * query-policy-contract.test.ts enforces both directions.
 *
 * Adding a read means tracing every Server mutation that changes it first
 * (docs/internals/react.md, "Query Policy"). One write without a covering
 * event leaves the read stale until the next unrelated event — keep such a
 * read on `syncedSnapshot` and name the gap instead.
 */
export const pushedSnapshotCoverage = {
    'chat.list': {
        events: [
            'message.created',
            'chat.read',
            'thread.follow.updated',
            'chat.lifecycle',
            'server.updated:agent',
            'server.updated:server',
        ],
        files: ['hooks/servers/use-chats.ts', 'hooks/servers/use-inbox-unread-count.ts'],
        recovery: ['chat.onEvent', 'server.onUpdate'],
    },
    'cloudAgentWork.listForChat': {
        events: ['cloud-agent-work.updated'],
        files: ['hooks/servers/use-cloud-agent-work.ts', 'hooks/servers/use-preload-chat.ts'],
        recovery: ['chat.onEvent'],
    },
    'member.get': {
        events: ['server.updated:server'],
        files: ['hooks/members/use-member.ts'],
        recovery: ['server.onUpdate'],
    },
    'member.list': {
        events: ['server.updated:server'],
        files: ['hooks/members/use-viewer-time-zone.ts', 'hooks/servers/use-members.ts'],
        recovery: ['server.onUpdate'],
    },
    'taskLabel.list': {
        events: ['task.label.updated'],
        files: ['hooks/servers/use-task-labels.ts'],
        recovery: ['chat.onEvent'],
    },
} as const satisfies Record<string, PushedSnapshotCoverage>;
