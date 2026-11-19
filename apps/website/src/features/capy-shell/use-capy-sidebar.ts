import * as React from 'react';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChats } from '../../hooks/servers/use-chats.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { readChannelOrder } from '../shell/channel-order.ts';
import { buildCapySidebar } from './sidebar-model.ts';

export function useCapySidebar(serverId: string) {
    const agents = useAgents(serverId).data;
    const chats = useChats(serverId).data;
    const openTasks = hausTrpc.task.listOpen.useQuery(
        { serverId },
        queryPolicy.syncedSnapshot
    ).data;
    const unreadPreviews = hausTrpc.chat.unreadPreviews.useQuery(
        { serverId },
        queryPolicy.syncedSnapshot
    ).data;
    const directory = useMembers(serverId).data;
    const [channelOrder] = React.useState(() => storedChannelOrder(serverId));

    return React.useMemo(
        () =>
            agents && chats
                ? buildCapySidebar({
                      agents,
                      channelOrder,
                      chats,
                      members: directory?.members ?? [],
                      openTasks: openTasks ?? [],
                      unreadPreviews: unreadPreviews?.previews ?? [],
                      viewerUserId: directory?.viewerUserId ?? null,
                  })
                : null,
        [agents, channelOrder, chats, directory, openTasks, unreadPreviews]
    );
}

export function storedChannelOrder(serverId: string) {
    const storage = globalThis.window?.localStorage;
    return storage ? readChannelOrder(storage, `haus.sidebar.channels.${serverId}`) : [];
}
