import type { UnreadThread } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The viewer's unread Threads on one Server (`thread.listUnread`), newest
 * activity first: the Inbox's Thread rows. A Thread is unread on its own,
 * never through its parent Chat (ADR 0042). Thread replies, Thread reads,
 * follows, and parent lifecycle changes invalidate it from their own streams.
 */
export function useUnreadThreads(serverId: string | undefined) {
    return hausTrpc.thread.listUnread.useQuery(
        { serverId: serverId ?? '' },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: serverId !== undefined,
            select: selectThreads,
        }
    );
}

/** Where an open Thread lands: its oldest counted reply, while the Thread is unread. */
export interface ThreadUnreadLanding {
    id: string;
    sequence: number;
}

/**
 * One Thread's landing reply, read from the same list. Undefined while the
 * list is loading or refetching, null when the Thread has nothing unread for
 * the viewer. A refetch is undecided too: an invalidated list may still hold
 * a local read patch that already dropped this Thread's row, and the landing
 * is decided once, so it must wait for the Server's answer.
 */
export function useThreadUnreadLanding(
    serverId: string,
    threadChatId: string | undefined
): ThreadUnreadLanding | null | undefined {
    const select = React.useCallback(
        ({ threads }: { threads: UnreadThread[] }): ThreadUnreadLanding | null => {
            const thread = threads.find((entry) => entry.threadChatId === threadChatId);
            return thread
                ? { id: thread.firstUnreadMessageId, sequence: thread.firstUnreadSequence }
                : null;
        },
        [threadChatId]
    );
    const query = hausTrpc.thread.listUnread.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, enabled: threadChatId !== undefined, select }
    );
    return settledLanding(query.data, query.isFetching);
}

/** A landing is decided only from data no fetch is about to replace. */
export function settledLanding(
    landing: ThreadUnreadLanding | null | undefined,
    isFetching: boolean
): ThreadUnreadLanding | null | undefined {
    return isFetching ? undefined : landing;
}

function selectThreads({ threads }: { threads: UnreadThread[] }): UnreadThread[] {
    return threads;
}
