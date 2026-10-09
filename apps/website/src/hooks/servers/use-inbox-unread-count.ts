import type { Chat } from '@haus/api';
import { selectUnreadChats } from '../../features/servers/inbox/unread-chats.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * How many Chats the Inbox lists as Unread, for surfaces that badge the Inbox
 * instead of opening it. It reads the same `chat.list` the section renders,
 * so the badge and the section never disagree, and it reports zero until
 * that read settles. It selects the count: the list changes on every message
 * anywhere, and the badge re-renders only when the count does.
 */
export function useInboxUnreadCount(serverId: string | undefined): {
    count: number;
    isReady: boolean;
} {
    const count = hausTrpc.chat.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.pushedSnapshot, enabled: serverId !== undefined, select: countUnread }
    ).data;

    return { count: count ?? 0, isReady: count !== undefined };
}

function countUnread(chats: Chat[]): number {
    return selectUnreadChats(chats).length;
}
