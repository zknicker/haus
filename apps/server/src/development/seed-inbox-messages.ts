import type { MessageBodyKind } from '@haus/api';
import { and, asc, eq, like, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';

export interface SeedMessage {
    authorAgentId?: string;
    authorUserId?: string;
    bodyKind?: MessageBodyKind;
    content: string;
    createdAt: Date;
    /** Minted up front when a record row has to point at this Message. */
    id?: string;
    nonce: string;
}

export interface SeededMessage {
    createdAt: Date;
    id: string;
    sequence: number;
}

const historySpacingMs = 6 * 60_000;

/**
 * Appends Messages to one Chat the way the product does: the Chat row
 * allocates the sequence block and carries the newest activity, and every row
 * carries a stable seed nonce, so a second seed collides rather than
 * duplicating. Messages must be given oldest first.
 */
export async function appendSeedMessages(
    tx: HausDatabase,
    input: { chatId: string; messages: SeedMessage[]; serverId: string }
): Promise<SeededMessage[]> {
    const newest = input.messages.at(-1);
    if (!newest) {
        throw new Error('The development Inbox seed appended no Messages.');
    }
    const [numbered] = await tx
        .update(chatsTable)
        .set({
            lastActivityAt: newest.createdAt,
            lastMessageSequence: sql`${chatsTable.lastMessageSequence} + ${input.messages.length}`,
        })
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    if (!numbered) {
        throw new Error(`The development Inbox seed found no Chat ${input.chatId}.`);
    }

    const base = numbered.sequence - input.messages.length;
    const rows = input.messages.map((message, index) => {
        const id = message.id ?? createOpaqueId('msg');
        return {
            authorAgentId: message.authorAgentId ?? null,
            authorUserId: message.authorUserId ?? null,
            bodyKind: message.bodyKind ?? ('text' as const),
            chatId: input.chatId,
            content: message.content,
            createdAt: message.createdAt,
            id,
            nonce: message.nonce,
            replyRootMessageId: id,
            sequence: base + index + 1,
            serverId: input.serverId,
        };
    });
    await tx.insert(chatMessagesTable).values(rows);

    return rows.map((row) => ({ createdAt: row.createdAt, id: row.id, sequence: row.sequence }));
}

/**
 * Pulls a Chat's seeded history into the past, ending just before the activity
 * about to be appended. Every base Message is written at boot, so appending
 * hours-old activity after them would otherwise leave sequence and clock
 * pointing in opposite directions inside one transcript. Only seed-written rows
 * move: a Message a person actually sent in this development workspace keeps
 * the moment it was sent.
 */
export async function backdateSeedHistory(
    tx: HausDatabase,
    input: { chatId: string; serverId: string; until: Date }
): Promise<void> {
    const rows = await tx
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                like(chatMessagesTable.nonce, 'dev-%')
            )
        )
        .orderBy(asc(chatMessagesTable.sequence));

    for (const [index, row] of rows.entries()) {
        await tx
            .update(chatMessagesTable)
            .set({
                createdAt: new Date(
                    input.until.getTime() - (rows.length - index) * historySpacingMs
                ),
            })
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    eq(chatMessagesTable.id, row.id)
                )
            );
    }
}
