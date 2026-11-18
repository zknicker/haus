import type { TaskMessagePlace } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { chatsTable } from '../postgres/schema.ts';

const originChannelsTable = alias(chatsTable, 'origin_channel');

/**
 * What a read of messages joined to their Chat selects to name each one's
 * place: the Chat, and through `originChannelJoin` the Channel a Task's Chat
 * started in. Selecting it in the read a list already makes is what keeps a
 * Task message's place from costing a read per row.
 */
export const messagePlaceColumns = {
    chatId: chatsTable.id,
    chatKind: chatsTable.kind,
    chatName: chatsTable.name,
    parentChatId: originChannelsTable.id,
    parentChatKind: originChannelsTable.kind,
    parentChatName: originChannelsTable.name,
};

export const originChannelJoin = [
    originChannelsTable,
    and(
        eq(originChannelsTable.serverId, chatsTable.serverId),
        eq(originChannelsTable.id, chatsTable.parentChatId)
    ),
] as const;

export interface MessagePlaceRow {
    chatId: string;
    chatKind: 'channel' | 'dm' | 'task';
    chatName: null | string;
    parentChatId: null | string;
    parentChatKind: 'channel' | 'dm' | 'task' | null;
    parentChatName: null | string;
}

export function messagePlaceOf(row: MessagePlaceRow): TaskMessagePlace {
    if (row.chatKind !== 'task') {
        return {
            chatId: row.chatId,
            chatKind: row.chatKind,
            chatName: row.chatKind === 'channel' ? row.chatName : null,
        };
    }
    const { parentChatId, parentChatKind, parentChatName } = row;
    if (!(parentChatId && parentChatKind === 'channel')) {
        throw new Error(`Task Chat ${row.chatId} has no Channel to hang off.`);
    }
    return { chatId: parentChatId, chatKind: 'channel', chatName: parentChatName };
}
