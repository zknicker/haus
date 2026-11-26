import type { Agent, Chat, ChatUnreadPreviewList } from '@haus/api';
import * as React from 'react';
import { useChatListSelection } from '../../hooks/servers/use-chats.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { readChannelOrder } from '../shell/channel-order.ts';
import {
    agentDmChatIds,
    capySidebarSections,
    personChatIds,
    projectIds,
    teamRoomId,
    sortedOpenTaskSlots,
    waitingChatIds,
    waitingFirst,
} from './sidebar-layout.ts';
import { useViewer } from './use-capy-sidebar-rows.ts';

export function useCapySidebarSections(serverId: string) {
    const agentIds = hausTrpc.agent.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectAgentIds }
    ).data;
    const chatLayout = useChatListSelection(serverId, selectChatLayout);
    const openTasks = hausTrpc.task.listActive.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: sortedOpenTaskSlots }
    ).data;
    const { viewerUserId } = useViewer(serverId);
    const selectWaiting = React.useCallback(
        (list: ChatUnreadPreviewList) => waitingChatIds(list.previews, viewerUserId),
        [viewerUserId]
    );
    const waiting = hausTrpc.chat.unreadPreviews.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectWaiting }
    ).data;

    return React.useMemo(
        () =>
            agentIds && chatLayout
                ? capySidebarSections({
                      ...chatLayout,
                      agentIds,
                      openTasks: waitingFirst(openTasks ?? [], waiting ?? []),
                  })
                : null,
        [agentIds, chatLayout, openTasks, waiting]
    );
}

export function storedChannelOrder(serverId: string) {
    const storage = globalThis.window?.localStorage;
    return storage ? readChannelOrder(storage, `haus.sidebar.channels.${serverId}`) : [];
}

function selectChatLayout(chats: Chat[]) {
    return {
        agentDmChatIds: agentDmChatIds(chats),
        personChatIds: personChatIds(chats),
        projectIds: projectIds(chats),
        teamRoomId: teamRoomId(chats),
    };
}

function selectAgentIds(agents: Agent[]) {
    return agents.map((agent) => agent.id);
}
