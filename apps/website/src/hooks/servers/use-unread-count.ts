import type { Chat, ChatUnreadPreviewList } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useUnreadCount(serverId: string | undefined) {
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
        select: countFollowedTaskPreviews,
    }).data;

    return unreadChats !== undefined && followedTaskCount !== undefined
        ? { count: unreadChats + followedTaskCount, isReady: true }
        : { count: 0, isReady: false };
}

export function countUnreadChats(chats: readonly Pick<Chat, 'unreadCount'>[]) {
    return chats.filter((chat) => chat.unreadCount > 0).length;
}

export function countFollowedTaskPreviews({ previews }: Pick<ChatUnreadPreviewList, 'previews'>) {
    return previews.filter((preview) => preview.task !== null).length;
}
