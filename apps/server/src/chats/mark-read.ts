import type { ChatReadReceipt, ServerDurableEvent } from '@haus/api';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatEventsTable, chatReadsTable, chatsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { allocateEventCursor } from './allocate-event-cursor.ts';
import { requireChatAccess } from './chat-access.ts';

type ReadTransaction = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export interface MarkChatReadResult {
    /** One reader-scoped `chat.read` per marker that moved. */
    events: ServerDurableEvent[];
    receipt: ChatReadReceipt;
}

/**
 * Moves the member's read marker in a Chat forward to `sequence` (clamped to
 * its newest message). With `includeThreads`, every Thread under the Chat is
 * read through its newest message too, so a Channel or DM row whose unread
 * count rolls up Thread replies clears in one step — the Inbox's Mark read.
 */
export async function markChatRead(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; includeThreads?: boolean; sequence: number; serverId: string }
): Promise<MarkChatReadResult> {
    return await db.transaction(async (tx) => {
        // Server row first, then authorize. Removal takes the Server row and
        // then deletes read markers; without this order a read marker would hold
        // its own row while waiting for the Server event cursor, and the two
        // would deadlock.
        await lockServerRow(tx, input.serverId);
        await requireChatAccess(tx, member, input);

        if (!member) {
            throw new Error('A Server member is required to mark a Chat read.');
        }

        const [chat] = await tx
            .select({
                lastMessageSequence: chatsTable.lastMessageSequence,
                parentChatId: chatsTable.parentChatId,
            })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
            .limit(1);

        if (!chat) {
            throw new Error('Failed to lock the Chat read state.');
        }

        const main = await advanceReadMarker(tx, {
            chatId: input.chatId,
            parentChatId: chat.parentChatId,
            readerUserId: member.id,
            sequence: Math.min(input.sequence, chat.lastMessageSequence),
            serverId: input.serverId,
        });
        const events = main.event ? [main.event] : [];

        if (input.includeThreads) {
            for (const thread of await readThreadsUnderChat(tx, input)) {
                const advanced = await advanceReadMarker(tx, {
                    chatId: thread.id,
                    parentChatId: input.chatId,
                    readerUserId: member.id,
                    sequence: thread.lastMessageSequence,
                    serverId: input.serverId,
                });
                if (advanced.event) {
                    events.push(advanced.event);
                }
            }
        }

        return {
            events,
            receipt: {
                chatId: input.chatId,
                eventCursor: main.event?.cursor ?? null,
                sequence: main.sequence,
                serverId: input.serverId,
            },
        };
    });
}

async function readThreadsUnderChat(
    tx: ReadTransaction,
    input: { chatId: string; serverId: string }
) {
    return await tx
        .select({ id: chatsTable.id, lastMessageSequence: chatsTable.lastMessageSequence })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.kind, 'thread'),
                eq(chatsTable.parentChatId, input.chatId),
                isNull(chatsTable.deletedAt),
                gt(chatsTable.lastMessageSequence, 0)
            )
        )
        .orderBy(chatsTable.id);
}

/**
 * Writes one marker forward-only and records its `chat.read` event. A marker
 * already at or past `sequence`, including one a concurrent read moved, is
 * left alone and emits nothing.
 */
async function advanceReadMarker(
    tx: ReadTransaction,
    input: {
        chatId: string;
        parentChatId: string | null;
        readerUserId: string;
        sequence: number;
        serverId: string;
    }
): Promise<{ event: ServerDurableEvent | null; sequence: number }> {
    const marker = and(
        eq(chatReadsTable.serverId, input.serverId),
        eq(chatReadsTable.chatId, input.chatId),
        eq(chatReadsTable.readerUserId, input.readerUserId)
    );
    const [existing] = await tx
        .select({ sequence: chatReadsTable.sequence })
        .from(chatReadsTable)
        .where(marker)
        .limit(1);

    if (existing && existing.sequence >= input.sequence) {
        return { event: null, sequence: existing.sequence };
    }

    const [written] = await tx
        .insert(chatReadsTable)
        .values({
            chatId: input.chatId,
            readerUserId: input.readerUserId,
            sequence: input.sequence,
            serverId: input.serverId,
        })
        .onConflictDoUpdate({
            set: { sequence: input.sequence, updatedAt: sql`now()` },
            target: [chatReadsTable.serverId, chatReadsTable.chatId, chatReadsTable.readerUserId],
            where: lt(chatReadsTable.sequence, input.sequence),
        })
        .returning({ sequence: chatReadsTable.sequence });

    if (!written) {
        const [current] = await tx
            .select({ sequence: chatReadsTable.sequence })
            .from(chatReadsTable)
            .where(marker)
            .limit(1);

        if (!current) {
            throw new Error('Failed to resolve the concurrent Chat read state.');
        }

        return { event: null, sequence: current.sequence };
    }

    const cursor = await allocateEventCursor(tx, input.serverId);
    const [event] = await tx
        .insert(chatEventsTable)
        .values({
            chatId: input.chatId,
            cursor,
            id: createOpaqueId('evt'),
            readerUserId: input.readerUserId,
            sequence: input.sequence,
            serverId: input.serverId,
            type: 'chat.read',
        })
        .returning({
            createdAt: chatEventsTable.createdAt,
            cursor: chatEventsTable.cursor,
            id: chatEventsTable.id,
        });

    if (!event) {
        throw new Error('Failed to record the Chat read event.');
    }

    return {
        event: {
            chatId: input.chatId,
            createdAt: event.createdAt.toISOString(),
            cursor: event.cursor.toString(),
            id: event.id,
            parentChatId: input.parentChatId,
            sequence: input.sequence,
            serverId: input.serverId,
            type: 'chat.read',
        },
        sequence: input.sequence,
    };
}
