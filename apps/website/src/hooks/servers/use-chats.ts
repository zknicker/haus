import type { Chat } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useChats(serverId: string | undefined) {
    return hausTrpc.chat.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}

/**
 * One chat's entry in the Server's chat list. The list changes on every
 * message anywhere (unread counts, activity order); a reader of one entry
 * re-renders only when that entry does.
 */
export function useListedChat(serverId: string, chatId: string): Chat | undefined {
    const select = React.useCallback(
        (chats: Chat[]) => chats.find((chat) => chat.id === chatId),
        [chatId]
    );
    return hausTrpc.chat.list.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, select })
        .data;
}

/**
 * A value derived from the chat list, for readers that need a fact about it
 * (a chat exists, where Chat returns to) rather than the list. Re-renders only
 * when the selected value changes. Memoize `select` on what it closes over:
 * React Query re-runs it when the list or its identity changes.
 */
export function useChatListSelection<T>(serverId: string, select: (chats: Chat[]) => T) {
    return hausTrpc.chat.list.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, select })
        .data;
}

/**
 * Which chats the sidebar lists, in Server order: channels, and DMs with
 * people (an Agent's DM rides its Agent's row). Keeps its identity until a
 * chat joins, leaves, or moves, so a message that only moves an unread count
 * re-renders that chat's row and not the navigation around it.
 */
export function useChatNavigationLayout(serverId: string): ChatNavigationLayout {
    return useChatListSelection(serverId, selectNavigationLayout) ?? noLayout;
}

export interface ChatNavigationLayout {
    /** Each Agent's DM chat, by Agent id; an Agent without one has no entry. */
    agentDmChatIds: Readonly<Record<string, string>>;
    channelIds: readonly string[];
    humanDmIds: readonly string[];
}

/**
 * One chat as its sidebar row shows it. Activity and last-message fields move
 * on every message in the chat (the open one included); they are left out, so
 * the row, and React Aria's collection around it, re-render only when what it
 * draws changes.
 */
export function useChatNavigationEntry(
    serverId: string,
    chatId: string
): ChatNavigationEntry | undefined {
    const select = React.useCallback(
        (chats: Chat[]): ChatNavigationEntry | undefined => {
            const chat = chats.find((entry) => entry.id === chatId);
            return chat
                ? {
                      color: chat.color,
                      icon: chat.icon,
                      id: chat.id,
                      kind: chat.kind,
                      name: chat.name,
                      peerAgentDisplayName: chat.peerAgentDisplayName,
                      serverId: chat.serverId,
                      unreadCount: chat.unreadCount,
                  }
                : undefined;
        },
        [chatId]
    );
    return useChatListSelection(serverId, select);
}

export type ChatNavigationEntry = Pick<
    Chat,
    'color' | 'icon' | 'id' | 'kind' | 'name' | 'peerAgentDisplayName' | 'serverId' | 'unreadCount'
>;

/** An Agent's DM as its sidebar row shows it; null until the DM has a chat. */
export function useAgentDmEntry(serverId: string, agentId: string): AgentDmEntry | null {
    const select = React.useCallback(
        (chats: Chat[]): AgentDmEntry | null => {
            const chat = chats.find(
                (entry) => entry.kind === 'dm' && entry.peerAgentId === agentId
            );
            return chat ? { id: chat.id, unreadCount: chat.unreadCount } : null;
        },
        [agentId]
    );
    return useChatListSelection(serverId, select) ?? null;
}

export interface AgentDmEntry {
    id: string;
    unreadCount: number;
}

/**
 * Chats by id for surfaces that render only their mark (color, icon), such as
 * reference chips in a transcript. Keeps one map until a mark changes: the
 * list itself changes on every message anywhere, and the Server orders it by
 * last activity, so the key sorts by id.
 */
export function useChatAppearances(serverId: string): ReadonlyMap<string, Chat> {
    const [select] = React.useState(createAppearanceSelector);
    return (
        hausTrpc.chat.list.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, select }).data ??
        noChats
    );
}

const noChats: ReadonlyMap<string, Chat> = new Map();
const noLayout: ChatNavigationLayout = { agentDmChatIds: {}, channelIds: [], humanDmIds: [] };

// React Query shares a selected result structurally, so equal id lists keep
// the previous object.
function selectNavigationLayout(chats: Chat[]): ChatNavigationLayout {
    const agentDmChatIds: Record<string, string> = {};
    for (const chat of chats) {
        // The first DM per Agent, as its row's `useAgentDmEntry` finds it.
        if (chat.kind === 'dm' && chat.peerAgentId && !(chat.peerAgentId in agentDmChatIds)) {
            agentDmChatIds[chat.peerAgentId] = chat.id;
        }
    }
    return {
        agentDmChatIds,
        channelIds: chats.filter((chat) => chat.kind === 'channel').map((chat) => chat.id),
        humanDmIds: chats
            .filter((chat) => chat.kind === 'dm' && !chat.peerAgentId)
            .map((chat) => chat.id),
    };
}

function createAppearanceSelector() {
    let previous: { byId: Map<string, Chat>; key: string } | null = null;
    return (chats: Chat[]): Map<string, Chat> => {
        const key = chats
            .map((chat) => `${chat.id}:${chat.color ?? ''}:${chat.icon ?? ''}`)
            .sort()
            .join('|');
        if (previous?.key !== key) {
            previous = { byId: new Map(chats.map((chat) => [chat.id, chat])), key };
        }
        return previous.byId;
    };
}
