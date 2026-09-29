import type { InboxMarkDoneResult, ServerDurableEvent } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { allocateEventCursor } from '../chats/allocate-event-cursor.ts';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatEventsTable, chatReadsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';

export class NeedsYouDoneBeyondLatestError extends Error {
    constructor() {
        super('Done cannot cover a message this Chat does not have yet.');
        this.name = 'NeedsYouDoneBeyondLatestError';
    }
}

export interface MarkNeedsYouDoneResult {
    event: ServerDurableEvent | null;
    result: InboxMarkDoneResult;
}

/**
 * Marks a Needs you row Done through `throughSequence` (ADR 0037). The Done
 * marker and the read marker only move forward and move together, in one
 * transaction; addressing that arrives later brings the row back. The
 * reader-scoped `chat.read` event is how the viewer's other surfaces refetch.
 */
export async function markNeedsYouDone(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; serverId: string; throughSequence: number }
): Promise<MarkNeedsYouDoneResult> {
    return await db.transaction(async (tx) => {
        // Server row first, then authorize, like every read-marker write.
        await lockServerRow(tx, input.serverId);
        const chat = await requireChatAccess(tx, member, input);
        if (!member) {
            throw new Error('A Server member is required to mark Needs you Done.');
        }
        if (input.throughSequence > chat.lastMessageSequence) {
            throw new NeedsYouDoneBeyondLatestError();
        }

        const through = input.throughSequence;
        const [previous] = await tx
            .select({
                doneSequence: chatReadsTable.doneSequence,
                sequence: chatReadsTable.sequence,
            })
            .from(chatReadsTable)
            .where(
                and(
                    eq(chatReadsTable.serverId, input.serverId),
                    eq(chatReadsTable.chatId, input.chatId),
                    eq(chatReadsTable.readerUserId, member.id)
                )
            )
            .for('update')
            .limit(1);
        const [written] = await tx
            .insert(chatReadsTable)
            .values({
                chatId: input.chatId,
                doneSequence: through,
                readerUserId: member.id,
                sequence: through,
                serverId: input.serverId,
            })
            .onConflictDoUpdate({
                set: {
                    doneSequence: sql`greatest(${chatReadsTable.doneSequence}, ${through})`,
                    sequence: sql`greatest(${chatReadsTable.sequence}, ${through})`,
                    updatedAt: sql`now()`,
                },
                target: [
                    chatReadsTable.serverId,
                    chatReadsTable.chatId,
                    chatReadsTable.readerUserId,
                ],
            })
            .returning({
                doneSequence: chatReadsTable.doneSequence,
                sequence: chatReadsTable.sequence,
            });
        if (!written) {
            throw new Error('Failed to record the Needs you Done marker.');
        }
        const result = { chatId: input.chatId, doneSequence: written.doneSequence };
        if (previous && previous.doneSequence >= through && previous.sequence >= through) {
            return { event: null, result };
        }

        const cursor = await allocateEventCursor(tx, input.serverId);
        const [event] = await tx
            .insert(chatEventsTable)
            .values({
                chatId: input.chatId,
                cursor,
                id: createOpaqueId('evt'),
                readerUserId: member.id,
                sequence: written.sequence,
                serverId: input.serverId,
                type: 'chat.read',
            })
            .returning({ createdAt: chatEventsTable.createdAt, id: chatEventsTable.id });
        if (!event) {
            throw new Error('Failed to record the Chat read event.');
        }
        return {
            event: {
                chatId: input.chatId,
                createdAt: event.createdAt.toISOString(),
                cursor: cursor.toString(),
                id: event.id,
                parentChatId: chat.parentChatId,
                sequence: written.sequence,
                serverId: input.serverId,
                type: 'chat.read',
            },
            result,
        };
    });
}
