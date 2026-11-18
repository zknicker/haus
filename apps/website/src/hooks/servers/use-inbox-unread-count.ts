import type { ChatUnreadPreviewList } from '@haus/api';

import {
    countUnreadChats,
    followedTaskPreviews,
} from '../../features/servers/inbox/unread-rows.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

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
