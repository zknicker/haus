import type { ServerDurableEvent } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatEventsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { allocateEventCursor } from './allocate-event-cursor.ts';

/** The Chat a durable event names, and the parent it reports for a Thread. */
export interface DurableEventChat {
    kind: 'channel' | 'dm' | 'thread';
    parentChatId: string | null;
}

export async function insertMessageCreatedEvent(
    db: Pick<HausDatabase, 'insert' | 'select' | 'update'>,
    input: {
        chat: DurableEventChat;
        message: {
            authorUserId: string | null;
            chatId: string;
            id: string;
            mentionedUserIds: string[];
            sequence: number;
            serverId: string;
            createdAt: Date;
        };
        /** The inline parent's human author, when this is a reply to a human. */
        replyToAuthorUserId: string | null;
        serverId: string;
    }
): Promise<ServerDurableEvent> {
    const cursor = await allocateEventCursor(db, input.serverId);
    const [event] = await db
        .insert(chatEventsTable)
        .values({
            chatId: input.message.chatId,
            cursor,
            id: createOpaqueId('evt'),
            messageId: input.message.id,
            sequence: input.message.sequence,
            serverId: input.serverId,
            type: 'message.created',
        })
        .returning({
            createdAt: chatEventsTable.createdAt,
            cursor: chatEventsTable.cursor,
            id: chatEventsTable.id,
        });
    if (!event) {
        throw new Error('Failed to record the Chat message event.');
    }
    return {
        authorUserId: input.message.authorUserId,
        chatId: input.message.chatId,
        createdAt: event.createdAt.toISOString(),
        cursor: event.cursor.toString(),
        id: event.id,
        mentionedUserIds: input.message.mentionedUserIds,
        messageId: input.message.id,
        parentChatId: input.chat.kind === 'thread' ? input.chat.parentChatId : null,
        replyToAuthorUserId: input.replyToAuthorUserId,
        sequence: input.message.sequence,
        serverId: input.serverId,
        threadAnchorAuthorUserId:
            input.chat.kind === 'thread'
                ? await readThreadAnchorAuthorUserId(db, {
                      serverId: input.serverId,
                      threadChatId: input.message.chatId,
                  })
                : null,
        type: 'message.created',
    };
}

/**
 * The human who wrote a Thread's anchor Message, or null for an Agent anchor
 * or a Chat that is not a Thread. A Thread answers its anchor author (ADR 0037).
 */
export async function readThreadAnchorAuthorUserId(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; threadChatId: string }
): Promise<string | null> {
    const [anchor] = await db
        .select({ authorUserId: chatMessagesTable.authorUserId })
        .from(chatsTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, chatsTable.serverId),
                eq(chatMessagesTable.chatId, chatsTable.parentChatId),
                eq(chatMessagesTable.id, chatsTable.anchorMessageId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.threadChatId),
                eq(chatsTable.kind, 'thread')
            )
        )
        .limit(1);
    return anchor?.authorUserId ?? null;
}
