import type { ChatReadReceipt } from '@haus/api';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatReadsTable, chatsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { chatReadTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { findTaskByChatId } from '../tasks/task-chat.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireChatAccess } from './chat-access.ts';

type ReadTransaction = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export interface MarkChatReadResult {
    /** The reader-scoped `chat.read`, when the marker moved. */
    events: PreparedRealtimeEvent[];
    receipt: ChatReadReceipt;
}

/**
 * Moves the member's read marker in a Chat forward to `sequence` (clamped to
 * its newest message).
 */
export async function markChatRead(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; sequence: number; serverId: string }
): Promise<MarkChatReadResult> {
    return await db.transaction(async (tx) => {
        // Server row first, then authorize. Removal takes the Server row and
        // then deletes read markers; without this order a read marker would hold
        // its own row while waiting for the Server row, and the two would
        // deadlock.
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

        return {
            events: main.event ? [main.event] : [],
            receipt: {
                chatId: input.chatId,
                advanced: main.event !== null,
                sequence: main.sequence,
                serverId: input.serverId,
            },
        };
    });
}

/**
 * Writes one marker forward-only and prepares its reader-only `chat.read` event. A marker
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
): Promise<{ event: PreparedRealtimeEvent | null; sequence: number }> {
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

    // Only a child Chat can be a Task's (ADR 0053).
    const task = input.parentChatId
        ? await findTaskByChatId(tx, { chatId: input.chatId, serverId: input.serverId })
        : null;
    return {
        event: chatReadTopic.prepare(
            {
                chatId: input.chatId,
                sequence: input.sequence,
                serverId: input.serverId,
                taskId: task?.taskId ?? null,
            },
            { audienceUserId: input.readerUserId }
        ),
        sequence: input.sequence,
    };
}
