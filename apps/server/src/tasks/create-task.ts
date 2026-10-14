import type { MessageTask } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { requireActiveDmPeer } from '../chats/active-dm-peer.ts';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import { replayCloudAgentWorkLinks } from '../chats/cloud-agent-work-links.ts';
import { replayImageGenerationLinks } from '../chats/image-generation-links.ts';
import { mentionedUserIds } from '../chats/mentioned-user-ids.ts';
import { prepareMessageCreatedEvent } from '../chats/message-created-event.ts';
import {
    prepareMessageLinkEvents,
    recordMessageLinks,
    resolveMessageLinks,
} from '../chats/message-links.ts';
import { ChatNonceConflictError } from '../chats/send-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, messageTasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { UntaskableMessageError } from './promote-task.ts';
import { TaskNotFoundError } from './task-errors.ts';
import { prepareTaskEvent } from './task-events.ts';
import { findMessageTask } from './task-shape.ts';

export interface CreateTaskResult {
    events: PreparedRealtimeEvent[];
    idempotent: boolean;
    task: MessageTask;
    wakes: Array<{ agentId: string; serverId: string }>;
}

export async function createTask(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        chatId: string;
        content: string;
        nonce: string;
        serverId: string;
    },
    agentDelivery: AgentDelivery
): Promise<CreateTaskResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!member) {
            throw new TaskNotFoundError();
        }

        await tx.execute(sql`
            select user_id from server_memberships
            where server_id = ${input.serverId}
              and user_id = ${member.id}
              and revoked_at is null
            for update
        `);
        await requireServerMembership(tx, member, input.serverId);
        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${input.chatId}
            for update
        `);
        const chat = await requireChatWriteAccess(tx, member, input);
        if (chat.kind !== 'channel' && chat.kind !== 'dm') {
            throw new UntaskableMessageError();
        }
        const [existing] = await tx
            .select()
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    eq(chatMessagesTable.chatId, input.chatId),
                    eq(chatMessagesTable.nonce, input.nonce)
                )
            )
            .limit(1);
        if (existing) {
            const replayed = await replayImageGenerationLinks(tx, {
                content: await replayCloudAgentWorkLinks(tx, {
                    content: input.content,
                    messageId: existing.id,
                    serverId: input.serverId,
                }),
                messageId: existing.id,
                serverId: input.serverId,
            });
            if (existing.authorUserId !== member.id || existing.content !== replayed) {
                throw new ChatNonceConflictError();
            }
            const task = await findMessageTask(tx, input.serverId, existing.id);
            if (!task) {
                throw new ChatNonceConflictError();
            }
            return { events: [], idempotent: true, task, wakes: [] };
        }
        await requireActiveDmPeer(tx, chat);
        const [numberedChat] = await tx
            .update(chatsTable)
            .set({
                lastActivityAt: sql`now()`,
                lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
                lastTaskNumber: sql`${chatsTable.lastTaskNumber} + 1`,
            })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
            .returning({
                messageSequence: chatsTable.lastMessageSequence,
                taskNumber: chatsTable.lastTaskNumber,
            });
        if (!numberedChat) {
            throw new Error('Failed to allocate task-message identity.');
        }

        const { cloudLinks, content, imageLinks } = await resolveMessageLinks(tx, {
            author: { kind: 'user', userId: member.id },
            content: input.content,
            serverId: input.serverId,
        });
        const [message] = await tx
            .insert(chatMessagesTable)
            .values({
                authorUserId: member.id,
                chatId: input.chatId,
                content,
                id: createOpaqueId('msg'),
                mentionedUserIds: mentionedUserIds(content),
                nonce: input.nonce,
                sequence: numberedChat.messageSequence,
                serverId: input.serverId,
            })
            .returning();
        await recordMessageLinks(tx, {
            chatId: input.chatId,
            cloudLinks,
            imageLinks,
            messageId: message.id,
            serverId: input.serverId,
        });

        await tx.insert(messageTasksTable).values({
            chatId: input.chatId,
            createdByUserId: member.id,
            messageId: message.id,
            number: numberedChat.taskNumber,
            origin: 'composed',
            serverId: input.serverId,
            status: 'todo',
        });

        const task = await findMessageTask(tx, input.serverId, message.id);
        if (!task) {
            throw new Error('Task creation did not persist.');
        }

        const messageEvent = await prepareMessageCreatedEvent(tx, message, null);
        const taskEvent = prepareTaskEvent({
            chatId: input.chatId,
            messageId: message.id,
            serverId: input.serverId,
            type: 'task.created',
        });
        const recipients = await planAgentMessageRecipients(tx, {
            authorAgentId: null,
            chatId: input.chatId,
            content,
            messageId: message.id,
            serverId: input.serverId,
        });
        for (const recipient of recipients) {
            await agentDelivery.enqueue(tx, {
                addressedReason: recipient.addressedReason,
                agentId: recipient.agentId,
                chatId: input.chatId,
                content,
                dedupeKey: message.id,
                mentioned: recipient.mentioned,
                sequence: message.sequence,
                serverId: input.serverId,
                source: 'human',
                threadFollowReactivated: recipient.threadFollowReactivated,
            });
        }

        return {
            events: [
                messageEvent,
                taskEvent,
                ...(await prepareMessageLinkEvents(tx, {
                    cloudLinks,
                    imageLinks,
                    serverId: input.serverId,
                })),
            ],
            idempotent: false,
            task,
            wakes: recipients.map(({ agentId }) => ({ agentId, serverId: input.serverId })),
        };
    });
}
