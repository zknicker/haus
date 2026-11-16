import type { TaskMessagePlace } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { chatsTable } from '../postgres/schema.ts';

const threadParentChatsTable = alias(chatsTable, 'thread_parent_chat');

/**
 * What a read of messages joined to their Chat selects to name each one's
 * place: the Chat, and through `threadParentChatJoin` the Channel or DM a Thread
 * hangs off. Selecting it in the read a list already makes is what keeps a
 * Thread reply's place from costing a read per row.
 */
export const messagePlaceColumns = {
    anchorMessageId: chatsTable.anchorMessageId,
    chatId: chatsTable.id,
    chatKind: chatsTable.kind,
    chatName: chatsTable.name,
    parentChatId: threadParentChatsTable.id,
    parentChatKind: threadParentChatsTable.kind,
    parentChatName: threadParentChatsTable.name,
};

export const threadParentChatJoin = [
    threadParentChatsTable,
    and(
        eq(threadParentChatsTable.serverId, chatsTable.serverId),
        eq(threadParentChatsTable.id, chatsTable.parentChatId)
    ),
] as const;

export interface MessagePlaceRow {
    anchorMessageId: null | string;
    chatId: string;
    chatKind: 'channel' | 'dm' | 'thread';
    chatName: null | string;
    parentChatId: null | string;
    parentChatKind: 'channel' | 'dm' | 'thread' | null;
    parentChatName: null | string;
}

/** A Thread with no parent or anchor is a broken record, so the mapping fails rather than guess. */
export function messagePlaceOf(row: MessagePlaceRow): TaskMessagePlace {
    if (row.chatKind !== 'thread') {
        return {
            chatId: row.chatId,
            chatKind: row.chatKind,
            chatName: row.chatKind === 'channel' ? row.chatName : null,
            threadAnchorMessageId: null,
        };
    }
    const { anchorMessageId, parentChatId, parentChatKind, parentChatName } = row;
    if (!(anchorMessageId && parentChatId && parentChatKind) || parentChatKind === 'thread') {
        throw new Error(`Thread ${row.chatId} has no Channel or DM to hang off.`);
    }
    return {
        chatId: parentChatId,
        chatKind: parentChatKind,
        chatName: parentChatKind === 'channel' ? parentChatName : null,
        threadAnchorMessageId: anchorMessageId,
    };
}
