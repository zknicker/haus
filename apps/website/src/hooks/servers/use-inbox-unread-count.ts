import type { ChatUnreadPreviewList } from '@haus/api';
import {
    countUnreadChats,
    followedTaskPreviews,
} from '../../features/servers/inbox/unread-rows.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * How many rows the Inbox lists as Unread — Chats and followed Tasks with
 * unread messages (ADR 0053) — for surfaces that badge the Inbox instead of
 * opening it. It counts the same `chat.list` and `chat.unreadPreviews` the
 * section renders, with the section's own rule (`selectUnreadRows`), so the
 * badge and the section never disagree, and it reports zero until both reads
 * settle.
 *
 * Each read selects only the count it contributes. The lists change on every
 * message anywhere; a number selection keeps the badge's host (the whole
 * sidebar) still until an unread Chat or a followed unread Task comes or goes.
 */
export function useInboxUnreadCount(serverId: string | undefined): {
    count: number;
    isReady: boolean;
} {
    const input = { serverId: serverId ?? '' };
    const enabled = serverId !== undefined;
    const unreadChats = hausTrpc.chat.list.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled,
        select: countUnreadChats,
    }).data;
    const followedTaskCount = hausTrpc.chat.unreadPreviews.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled,
        select: selectFollowedTaskCount,
    }).data;

    return unreadChats !== undefined && followedTaskCount !== undefined
        ? { count: unreadChats + followedTaskCount, isReady: true }
        : { count: 0, isReady: false };
}

function selectFollowedTaskCount({ previews }: ChatUnreadPreviewList): number {
    return followedTaskPreviews(previews).length;
}
