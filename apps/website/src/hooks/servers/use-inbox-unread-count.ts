import type { TaskInboxList, UnreadThreadList } from '@haus/api';
import { countUnreadRows, unreadChatFacts } from '../../features/servers/inbox/unread-rows.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * How many rows the Inbox lists as Unread — Chats, Threads (ADR 0043), and
 * Task items (ADR 0051) — for surfaces that badge the Inbox instead of opening
 * it. It counts the same `chat.list`, `thread.listUnread`, and `taskInbox.list`
 * the section renders, with the section's own rule (`countUnreadRows`), so the
 * badge and the section never disagree, and it reports zero until all three
 * reads settle.
 *
 * Each read selects only the facts the count needs. The lists change on every
 * message anywhere; structural sharing keeps these selections, and so the
 * badge's host (the whole sidebar), still until an unread Chat, a Chat, an
 * unread Thread's parent, or a Task item comes or goes.
 */
export function useInboxUnreadCount(serverId: string | undefined): {
    count: number;
    isReady: boolean;
} {
    const input = { serverId: serverId ?? '' };
    const enabled = serverId !== undefined;
    const chats = hausTrpc.chat.list.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled,
        select: unreadChatFacts,
    }).data;
    const threadParentIds = hausTrpc.thread.listUnread.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled,
        select: selectThreadParentIds,
    }).data;
    const taskItemCount = hausTrpc.taskInbox.list.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled,
        select: selectTaskItemCount,
    }).data;

    return chats && threadParentIds && taskItemCount !== undefined
        ? { count: countUnreadRows(chats, threadParentIds, taskItemCount), isReady: true }
        : { count: 0, isReady: false };
}

function selectThreadParentIds({ threads }: UnreadThreadList): string[] {
    return threads.map((thread) => thread.parentChatId).sort();
}

function selectTaskItemCount({ items }: TaskInboxList): number {
    return items.length;
}
