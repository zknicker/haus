import type { ChannelDeleteReceipt, ChannelLifecycleReceipt } from '@haus/api';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, chatsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { purgeDeletedChannel } from './channel-deletion.ts';
import { prepareLifecycleEvent } from './lifecycle-events.ts';

export { purgeDeletedChannels } from './channel-deletion.ts';

export class ChannelLifecycleDeniedError extends Error {
    constructor(message = 'Only a Server Owner or Admin can manage channel lifecycle.') {
        super(message);
        this.name = 'ChannelLifecycleDeniedError';
    }
}

export class ChannelLifecycleConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChannelLifecycleConflictError';
    }
}

interface LifecycleResult<Receipt> {
    event: PreparedRealtimeEvent | null;
    receipt: Receipt;
}

export async function archiveChannel(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; serverId: string }
): Promise<LifecycleResult<ChannelLifecycleReceipt>> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireOperator(tx, member, input.serverId);
        const channel = await requireRegularChannel(tx, input);
        if (channel.archivedAt) {
            return {
                event: null,
                receipt: {
                    archivedAt: channel.archivedAt.toISOString(),
                    chatId: channel.id,
                    serverId: input.serverId,
                },
            };
        }

        const archivedAt = new Date();
        await tx
            .update(chatsTable)
            .set({ archivedAt, archivedByUserId: member?.id ?? null })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        await discardQueuedChannelWork(tx, input);
        const event = prepareLifecycleEvent(input, 'archived');
        return {
            event,
            receipt: {
                archivedAt: archivedAt.toISOString(),
                chatId: channel.id,
                serverId: input.serverId,
            },
        };
    });
}

export async function unarchiveChannel(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; serverId: string }
): Promise<LifecycleResult<ChannelLifecycleReceipt>> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireOperator(tx, member, input.serverId);
        const channel = await requireRegularChannel(tx, input);
        if (!channel.archivedAt) {
            return {
                event: null,
                receipt: { archivedAt: null, chatId: channel.id, serverId: input.serverId },
            };
        }

        await tx
            .update(chatsTable)
            .set({ archivedAt: null, archivedByUserId: null })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        const event = prepareLifecycleEvent(input, 'unarchived');
        return {
            event,
            receipt: { archivedAt: null, chatId: channel.id, serverId: input.serverId },
        };
    });
}

export async function deleteChannel(
    db: HausDatabase,
    attachmentRoot: AttachmentRoot,
    member: HausUser | null,
    input: { chatId: string; confirmation: string; serverId: string }
): Promise<LifecycleResult<ChannelDeleteReceipt>> {
    const event = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireOperator(tx, member, input.serverId);
        const channel = await requireRegularChannel(tx, input);
        if (input.confirmation !== channel.name) {
            throw new ChannelLifecycleDeniedError('Type the channel name exactly to delete it.');
        }
        if (channel.deletedAt) {
            return null;
        }

        const deletedAt = new Date();
        await tx
            .update(chatsTable)
            .set({ deletedAt, deletedByUserId: member?.id ?? null })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        await discardQueuedChannelWork(tx, input);
        return prepareLifecycleEvent(input, 'deleted');
    });

    await purgeDeletedChannel(db, attachmentRoot, input);
    return { event, receipt: { chatId: input.chatId, serverId: input.serverId } };
}

async function requireOperator(db: HausDatabase, member: HausUser | null, serverId: string) {
    const server = await requireServerMembership(db, member, serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new ChannelLifecycleDeniedError();
    }
}

async function requireRegularChannel(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
) {
    const [channel] = await db
        .select({
            archivedAt: chatsTable.archivedAt,
            deletedAt: chatsTable.deletedAt,
            id: chatsTable.id,
            isAll: chatsTable.isAll,
            kind: chatsTable.kind,
            name: chatsTable.name,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .for('update');
    if (!channel || channel.kind !== 'channel') {
        throw new ChannelLifecycleConflictError('Only a regular channel can use this action.');
    }
    if (channel.isAll) {
        throw new ChannelLifecycleConflictError('#all cannot be archived or deleted.');
    }
    if (!channel.name) {
        throw new Error('A regular channel must have a name.');
    }
    return { ...channel, name: channel.name };
}

async function discardQueuedChannelWork(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
) {
    const chats = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                or(eq(chatsTable.id, input.chatId), eq(chatsTable.parentChatId, input.chatId))
            )
        );
    await db.delete(agentInboxTable).where(
        and(
            eq(agentInboxTable.serverId, input.serverId),
            inArray(
                agentInboxTable.chatId,
                chats.map(({ id }) => id)
            ),
            isNull(agentInboxTable.runId),
            eq(agentInboxTable.state, 'queued')
        )
    );
}
