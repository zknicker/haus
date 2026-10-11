import type { ChatReadReceipt } from '@haus/api';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatReadsTable, chatsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { chatReadTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireChatAccess } from './chat-access.ts';

type ReadTransaction = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export interface MarkChatReadResult {
    /** One reader-scoped `chat.read` per marker that moved. */
    events: PreparedRealtimeEvent[];
    receipt: ChatReadReceipt;
}

/**
 * Moves the member's read marker in a Chat forward to `sequence` (clamped to
 * its newest message). With `includeThreads`, every Thread under the Chat is
 * read through its newest message too, so Mark read on a Channel or DM's Inbox
 * row also clears that Chat's Thread rows. A Thread's own Inbox row marks the
 * Thread's `chatId` without `includeThreads`.
 */
export async function markChatRead(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; includeThreads?: boolean; sequence: number; serverId: string }
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
                anchorMessageId: chatsTable.anchorMessageId,
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
            anchorMessageId: chat.anchorMessageId,
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
                    anchorMessageId: thread.anchorMessageId,
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
                advanced: main.event !== null,
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
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            id: chatsTable.id,
            lastMessageSequence: chatsTable.lastMessageSequence,
        })
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
 * Writes one marker forward-only and prepares its reader-only `chat.read` event. A marker
 * already at or past `sequence`, including one a concurrent read moved, is
 * left alone and emits nothing.
 */
async function advanceReadMarker(
    tx: ReadTransaction,
    input: {
        /** The parent-Chat anchor when this marker is a Thread's. */
        anchorMessageId: string | null;
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

    return {
        event: chatReadTopic.prepare(
            {
                chatId: input.chatId,
                parentChatId: input.anchorMessageId ? input.parentChatId : null,
                sequence: input.sequence,
                serverId: input.serverId,
                threadAnchorMessageId: input.parentChatId ? input.anchorMessageId : null,
            },
            { audienceUserId: input.readerUserId }
        ),
        sequence: input.sequence,
    };
}
