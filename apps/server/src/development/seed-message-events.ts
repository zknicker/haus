import { allocateEventCursor } from '../chats/allocate-event-cursor.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatEventsTable, chatMessagesTable } from '../postgres/schema.ts';

/** Inserts seeded Messages with the `message.created` events a real send writes. */
export async function insertSeedMessages(
    tx: Pick<HausDatabase, 'insert' | 'update'>,
    serverId: string,
    values: (typeof chatMessagesTable.$inferInsert)[]
) {
    const messages = await tx.insert(chatMessagesTable).values(values).returning({
        chatId: chatMessagesTable.chatId,
        id: chatMessagesTable.id,
        sequence: chatMessagesTable.sequence,
    });
    await recordSeedMessageEvents(tx, serverId, messages);
}

/**
 * The `message.created` events a real send writes, for Messages a seed inserts
 * directly. The Agent inbox orders conversations by their newest Message's
 * event cursor, so a seeded Message without one cannot be listed.
 */
export async function recordSeedMessageEvents(
    tx: Pick<HausDatabase, 'insert' | 'update'>,
    serverId: string,
    messages: Array<{ chatId: string; id: string; sequence: number }>
) {
    for (const message of messages) {
        await tx.insert(chatEventsTable).values({
            chatId: message.chatId,
            cursor: await allocateEventCursor(tx, serverId),
            id: createOpaqueId('evt'),
            messageId: message.id,
            sequence: message.sequence,
            serverId,
            type: 'message.created',
        });
    }
}
