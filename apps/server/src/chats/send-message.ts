import type { ChatMessageReceipt, ChatSendInput, ServerDurableEvent } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { settleAskForReply } from '../asks/settle-ask.ts';
import {
    associateMessageAttachments,
    attachmentMetadata,
    requireMessageAttachments,
} from '../attachments/message-attachments.ts';
import { applyMessageRouting } from '../message-routing/apply-message-routing.ts';
import type { MessageRouter } from '../message-routing/jev.ts';
import { prepareMessageRouting } from '../message-routing/route-human-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    chatEventsTable,
    chatMessagesTable,
    chatsTable,
    threadFollowsTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { ensureThread } from '../threads/ensure-thread.ts';
import { autoFollowThreadMentions } from '../threads/thread-attention.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireActiveDmPeer } from './active-dm-peer.ts';
import { allocateEventCursor } from './allocate-event-cursor.ts';
import { requireChatWriteAccess } from './chat-access.ts';
import { ensureAgentDmRecord } from './ensure-agent-dm.ts';
import { toChatMessage } from './message-shape.ts';
import {
    InvalidInlineReplyError,
    readInlineReplyContext,
    resolveChatReplyParent,
} from './reply-context.ts';
import { readExistingChatMessage, replayChatMessage } from './send-message-replay.ts';

export class ChatNonceConflictError extends Error {
    constructor() {
        super('That message nonce already belongs to a different send.');
        this.name = 'ChatNonceConflictError';
    }
}

export class DirectThreadSendError extends Error {
    constructor() {
        super('Thread replies require their parent Chat and anchor message.');
        this.name = 'DirectThreadSendError';
    }
}

export interface SendChatMessageResult {
    events: ServerDurableEvent[];
    receipt: ChatMessageReceipt;
    /** Agents whose durable pending inbox this send enqueued. */
    wakes: Array<{ agentId: string; serverId: string }>;
}

export async function sendChatMessage(
    db: HausDatabase,
    member: HausUser | null,
    input: ChatSendInput,
    agentDelivery: AgentDelivery,
    messageRouter?: MessageRouter
): Promise<SendChatMessageResult> {
    const preparedRouting = await prepareMessageRouting(db, member, input, messageRouter);
    return await db.transaction(async (tx) => {
        // Server row first, then authorize: a send that started before a removal
        // must re-read membership behind it rather than commit past it.
        await lockServerRow(tx, input.serverId);

        if (!member) {
            throw new Error('A message author is required.');
        }

        const targetChatId =
            'agentId' in input
                ? (
                      await ensureAgentDmRecord(tx, {
                          agentId: input.agentId,
                          serverId: input.serverId,
                          userId: member.id,
                      })
                  ).id
                : input.chatId;
        if ('chatId' in input && input.thread && input.replyToMessageId) {
            throw new InvalidInlineReplyError(
                'Inline replies cannot target a Thread; use either a thread or an inline reply.'
            );
        }
        const thread =
            'chatId' in input && input.thread
                ? await ensureThread(tx, member, {
                      anchorMessageId: input.thread.anchorMessageId,
                      parentChatId: targetChatId,
                      serverId: input.serverId,
                  })
                : null;
        const writeChatId = thread?.id ?? targetChatId;

        const writeChat = await requireChatWriteAccess(tx, member, {
            chatId: writeChatId,
            serverId: input.serverId,
        });
        if ('chatId' in input && !input.thread && writeChat.kind === 'thread') {
            throw new DirectThreadSendError();
        }
        const replyParent = await resolveChatReplyParent(tx, input, targetChatId);

        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${writeChatId}
            for update
        `);

        const existing = await readExistingChatMessage(
            tx,
            input.serverId,
            writeChatId,
            input.nonce
        );

        if (existing) {
            return await replayChatMessage(
                tx,
                member,
                input,
                existing,
                thread?.id ?? null,
                replyParent?.parent.id ?? null,
                () => new ChatNonceConflictError()
            );
        }
        await requireActiveDmPeer(tx, writeChat);

        const attachments = await requireMessageAttachments(tx, member, {
            attachmentIds: input.attachmentIds,
            chatId: writeChatId,
            ...(thread ? { parentChatId: thread.parentChatId } : {}),
            serverId: input.serverId,
        });
        const [updatedChat] = await tx
            .update(chatsTable)
            .set({
                lastActivityAt: sql`now()`,
                lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
            })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, writeChatId)))
            .returning({ sequence: chatsTable.lastMessageSequence });

        if (!updatedChat) {
            throw new Error('Failed to allocate the Chat message sequence.');
        }

        const messageId = createOpaqueId('msg');
        const [message] = await tx
            .insert(chatMessagesTable)
            .values({
                authorUserId: member.id,
                chatId: writeChatId,
                content: input.content,
                id: messageId,
                nonce: input.nonce,
                replyRootMessageId: replyParent?.root.id ?? messageId,
                replyToMessageId: replyParent?.parent.id ?? null,
                sequence: updatedChat.sequence,
                serverId: input.serverId,
            })
            .returning();

        await associateMessageAttachments(tx, attachments, message.id, writeChatId);
        if (thread) {
            await tx
                .insert(threadFollowsTable)
                .values({
                    serverId: input.serverId,
                    threadChatId: thread.id,
                    userId: member.id,
                })
                .onConflictDoUpdate({
                    set: { followed: true, updatedAt: sql`now()` },
                    target: [
                        threadFollowsTable.serverId,
                        threadFollowsTable.threadChatId,
                        threadFollowsTable.userId,
                    ],
                });
            await autoFollowThreadMentions(tx, {
                content: input.content,
                parentChatId: thread.parentChatId,
                serverId: input.serverId,
                threadChatId: thread.id,
            });
        }

        const eventCursor = await allocateEventCursor(tx, input.serverId);
        const [event] = await tx
            .insert(chatEventsTable)
            .values({
                chatId: writeChatId,
                cursor: eventCursor,
                id: createOpaqueId('evt'),
                messageId: message.id,
                sequence: message.sequence,
                serverId: input.serverId,
                type: 'message.created',
            })
            .returning({
                createdAt: chatEventsTable.createdAt,
                cursor: chatEventsTable.cursor,
                id: chatEventsTable.id,
            });

        // A reply into an Ask's Thread settles that Ask in this same
        // transaction. The asking Agent's own reply never settles it.
        const settledAsk =
            'chatId' in input && input.thread && thread
                ? await settleAskForReply(tx, {
                      anchorMessageId: input.thread.anchorMessageId,
                      answeredBy: { id: member.id, kind: 'user' },
                      answerMessageId: message.id,
                      replySequence: message.sequence,
                      serverId: input.serverId,
                      threadChatId: thread.id,
                  })
                : null;

        // Plan every Agent recipient under its Server-owned attention state in
        // this same transaction. The wire nudge remains separately recoverable.
        const plannedRecipients = await planAgentMessageRecipients(tx, {
            authorAgentId: null,
            chatId: writeChatId,
            content: input.content,
            messageId: message.id,
            serverId: input.serverId,
        });
        const recipients = await applyMessageRouting(tx, {
            serverId: input.serverId,
            chatId: writeChatId,
            sequence: writeChat.lastMessageSequence,
            prepared: preparedRouting,
            chatKind: writeChat.kind,
            isReply: Boolean(input.replyToMessageId),
            messageId: message.id,
            recipients: plannedRecipients,
        });
        for (const recipient of recipients) {
            await agentDelivery.enqueue(tx, {
                addressedReason: recipient.addressedReason,
                agentId: recipient.agentId,
                chatId: writeChatId,
                content: input.content,
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
                {
                    chatId: message.chatId,
                    createdAt: event.createdAt.toISOString(),
                    cursor: event.cursor.toString(),
                    id: event.id,
                    messageId: message.id,
                    parentChatId: thread?.parentChatId ?? null,
                    sequence: message.sequence,
                    serverId: message.serverId,
                    type: 'message.created',
                },
                ...(settledAsk ? [settledAsk] : []),
            ],
            receipt: {
                eventCursor: event.cursor.toString(),
                idempotent: false,
                // A human send never creates a typed body; this Message is text.
                message: toChatMessage(message, {
                    attachments: attachmentMetadata(attachments),
                    reply: await readInlineReplyContext(tx, input.serverId, message),
                }),
                threadChatId: thread?.id ?? null,
            },
            wakes: recipients.map(({ agentId }) => ({ agentId, serverId: input.serverId })),
        };
    });
}
