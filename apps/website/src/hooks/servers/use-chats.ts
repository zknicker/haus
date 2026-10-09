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
