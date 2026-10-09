import type { MessageTask } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageTasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { prepareTaskEvent } from './task-events.ts';
import { findMessageTask } from './task-shape.ts';

export class TaskMessageNotFoundError extends Error {
    constructor() {
        super('No taskable message exists in this Server with that id.');
        this.name = 'TaskMessageNotFoundError';
    }
}

export class UntaskableMessageError extends Error {
    constructor() {
        super('Only human or Agent messages in a top-level Channel or DM can become tasks.');
        this.name = 'UntaskableMessageError';
    }
}

export async function promoteMessageTask(
    db: HausDatabase,
    member: HausUser | null,
    input: { messageId: string; serverId: string }
): Promise<{
    event: PreparedRealtimeEvent | null;
    idempotent: boolean;
    task: MessageTask;
}> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!member) {
            throw new TaskMessageNotFoundError();
        }

        await tx.execute(sql`
            select user_id from server_memberships
            where server_id = ${input.serverId}
              and user_id = ${member.id}
              and revoked_at is null
            for update
        `);

        const [message] = await tx
            .select({
                chatId: chatMessagesTable.chatId,
                id: chatMessagesTable.id,
            })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    eq(chatMessagesTable.id, input.messageId)
                )
            )
            .limit(1);
        if (!message) {
            throw new TaskMessageNotFoundError();
        }

        const chat = await requireChatWriteAccess(tx, member, {
            chatId: message.chatId,
            serverId: input.serverId,
        });
        if (chat.kind === 'thread') {
            throw new UntaskableMessageError();
        }

        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${message.chatId}
            for update
        `);

        const existing = await findMessageTask(tx, input.serverId, input.messageId);
        if (existing) {
            return { event: null, idempotent: true, task: existing };
        }

        const [numberedChat] = await tx
            .update(chatsTable)
            .set({ lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1` })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, message.chatId)))
            .returning({ number: chatsTable.lastTaskNumber });
        if (!numberedChat) {
            throw new TaskMessageNotFoundError();
        }

        // Promotion does not create the Thread. Tasks never own Threads: a
        // message gets a task, a message gets a Thread, and they meet only
        // because they share the anchor. The first reply materializes it.
        await tx.insert(messageTasksTable).values({
            chatId: message.chatId,
            createdByUserId: member.id,
            messageId: message.id,
            number: numberedChat.number,
            origin: 'converted',
            serverId: input.serverId,
        });

        const task = await findMessageTask(tx, input.serverId, input.messageId);
        if (!task) {
            throw new Error('Task promotion did not persist.');
        }
        const event = prepareTaskEvent({
            chatId: message.chatId,
            messageId: message.id,
            serverId: input.serverId,
            type: 'task.created',
        });
        return { event, idempotent: false, task };
    });
}
