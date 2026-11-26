import type { Agent, Chat, ChatUnreadPreviewList, Task } from '@haus/api';
import type { ServerMemberDirectory } from '@haus/api/membership';
import * as React from 'react';
import { useAgentDmEntry, useChatListSelection } from '../../hooks/servers/use-chats.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { captainTile, openTaskRow, personRow, taskUnread } from './sidebar-model.ts';

export function useCaptainTile(serverId: string, agentId: string) {
    const select = React.useCallback(
        (agents: Agent[]) => {
            const agent = agents.find((entry) => entry.id === agentId);
            return agent
                ? {
                      availability: agent.availability,
                      avatarUrl: agent.avatarUrl,
                      displayName: agent.displayName,
                      id: agent.id,
                      wakePause: agent.wakePause,
                  }
                : undefined;
        },
        [agentId]
    );
    const agent = hausTrpc.agent.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select }
    ).data;
    const dm = useAgentDmEntry(serverId, agentId);
    return agent ? captainTile(agent, dm) : undefined;
}

export function usePersonRow(serverId: string, chatId: string) {
    const select = React.useCallback(
        (chats: Chat[]) => {
            const chat = chats.find((entry) => entry.id === chatId);
            return chat
                ? { id: chat.id, peerUserId: chat.peerUserId, unreadCount: chat.unreadCount }
                : undefined;
        },
        [chatId]
    );
    const chat = useChatListSelection(serverId, select);
    const member = useMember(serverId, chat?.peerUserId ?? null);
    return chat ? personRow(chat, member) : undefined;
}

export function useOpenTaskRow(serverId: string, taskId: string) {
    const selectTask = React.useCallback(
        (tasks: Task[]) => {
            const task = tasks.find((entry) => entry.id === taskId);
            return task
                ? {
                      archivedAt: task.archivedAt,
                      chatId: task.chatId,
                      id: task.id,
                      shortId: task.shortId,
                      title: task.title,
                  }
                : undefined;
        },
        [taskId]
    );
    const task = hausTrpc.task.listActive.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectTask }
    ).data;
    const viewer = useViewer(serverId);
    const chatId = task?.chatId ?? null;
    const selectUnread = React.useCallback(
        (list: ChatUnreadPreviewList) =>
            taskUnread(
                list.previews.find((preview) => preview.chatId === chatId),
                viewer.viewerUserId
            ),
        [chatId, viewer.viewerUserId]
    );
    const unread = hausTrpc.chat.unreadPreviews.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectUnread }
    ).data;
    return task
        ? openTaskRow({ task, unread: unread ?? { mentionsViewer: false, unreadCount: 0 } })
        : undefined;
}

export function useViewer(serverId: string) {
    return (
        hausTrpc.member.list.useQuery(
            { serverId },
            { ...queryPolicy.syncedSnapshot, select: selectViewer }
        ).data ?? noViewer
    );
}

function useMember(serverId: string, userId: string | null) {
    const select = React.useCallback(
        (list: ServerMemberDirectory) => {
            const member = list.members.find((entry) => entry.userId === userId);
            return member
                ? {
                      avatarUrl: member.avatarUrl,
                      displayName: member.displayName,
                      userId: member.userId,
                  }
                : undefined;
        },
        [userId]
    );
    return hausTrpc.member.list.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, select })
        .data;
}

function selectViewer(list: ServerMemberDirectory) {
    return { viewerUserId: list.viewerUserId };
}

const noViewer: { viewerUserId: string | null } = { viewerUserId: null };
