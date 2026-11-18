import type { ChatMessageReceipt, ChatSendInput } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import {
    associateMessageAttachments,
    attachmentMetadata,
    requireMessageAttachments,
} from '../attachments/message-attachments.ts';
import { readLinkedCloudAgentWork } from '../cloud-agents/linked-cloud-agent-work.ts';
import { readLinkedImageGenerations } from '../image-generation/linked-image-generations.ts';
import { applyMessageRouting } from '../message-routing/apply-message-routing.ts';
import type { MessageRouter } from '../message-routing/jev.ts';
import { prepareMessageRouting } from '../message-routing/route-human-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { readMessageTaskLinks } from '../tasks/task-reference-links.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireActiveDmPeer } from './active-dm-peer.ts';
import { requireChatWriteAccess } from './chat-access.ts';
import { ensureAgentDmRecord } from './ensure-agent-dm.ts';
import { mentionedUserIds } from './mentioned-user-ids.ts';
import { prepareMessageCreatedEvent } from './message-created-event.ts';
import {
    prepareMessageLinkEvents,
    recordMessageLinks,
    resolveMessageLinks,
} from './message-links.ts';
import { toChatMessage } from './message-shape.ts';
import { applyPostFollows } from './post-follows.ts';
import { readInlineReplyContext, resolveChatReplyParent } from './reply-context.ts';
import { readExistingChatMessage, replayChatMessage } from './send-message-replay.ts';

export class ChatNonceConflictError extends Error {
    constructor() {
        super('That message nonce already belongs to a different send.');
        this.name = 'ChatNonceConflictError';
    }
}

export interface SendChatMessageResult {
    /** Realtime events to publish once the send commits. */
    events: PreparedRealtimeEvent[];
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
        const writeChatId = targetChatId;

        const writeChat = await requireChatWriteAccess(tx, member, {
            chatId: writeChatId,
            serverId: input.serverId,
        });
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
                replyParent?.parent.id ?? null,
                () => new ChatNonceConflictError()
            );
        }
        await requireActiveDmPeer(tx, writeChat);

        const attachments = await requireMessageAttachments(tx, member, {
            attachmentIds: input.attachmentIds,
            chatId: writeChatId,
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

        const linked = await resolveMessageLinks(tx, {
            author: { kind: 'user', userId: member.id },
            content: input.content,
            serverId: input.serverId,
        });
        const { content } = linked;
        const messageId = createOpaqueId('msg');
        const [message] = await tx
            .insert(chatMessagesTable)
            .values({
                authorUserId: member.id,
                chatId: writeChatId,
                content,
                id: messageId,
                mentionedUserIds: mentionedUserIds(content),
                nonce: input.nonce,
                replyRootMessageId: replyParent?.root.id ?? messageId,
                replyToMessageId: replyParent?.parent.id ?? null,
                sequence: updatedChat.sequence,
                serverId: input.serverId,
            })
            .returning();

        await associateMessageAttachments(tx, attachments, message.id, writeChatId);
        await recordMessageLinks(tx, {
            ...linked,
            chatId: writeChatId,
            messageId,
            serverId: input.serverId,
        });
        const placeEvents = await applyPostFollows(
            tx,
            {
                chatId: writeChatId,
                kind: writeChat.kind,
                parentChatId: writeChat.parentChatId,
                serverId: input.serverId,
            },
            {
                author: { kind: 'user', userId: member.id },
                content,
                mentionedUserIds: message.mentionedUserIds,
            }
        );

        const created = await prepareMessageCreatedEvent(
            tx,
            message,
            replyParent?.parent.authorUserId ?? null
        );

        // Plan every Agent recipient under its Server-owned attention state in
        // this same transaction. The wire nudge remains separately recoverable.
        const plannedRecipients = await planAgentMessageRecipients(tx, {
            authorAgentId: null,
            chatId: writeChatId,
            content,
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
                content,
                dedupeKey: message.id,
                mentioned: recipient.mentioned,
                sequence: message.sequence,
                serverId: input.serverId,
                source: 'human',
                taskFollowReactivated: recipient.taskFollowReactivated,
            });
        }

        return {
            events: [
                created,
                ...placeEvents,
                ...(await prepareMessageLinkEvents(tx, { ...linked, serverId: input.serverId })),
            ],
            receipt: {
                idempotent: false,
                // A human send never creates a typed body; this Message is text.
                message: toChatMessage(message, {
                    attachments: attachmentMetadata(attachments),
                    cloudAgentWork:
                        (await readLinkedCloudAgentWork(tx, input.serverId, [messageId])).get(
                            messageId
                        ) ?? [],
                    imageGenerations:
                        (await readLinkedImageGenerations(tx, input.serverId, [messageId])).get(
                            messageId
                        ) ?? [],
                    reply: await readInlineReplyContext(tx, input.serverId, message),
                    taskLinks: (await readMessageTaskLinks(tx, input.serverId, [messageId])).get(
                        messageId
                    ),
                }),
            },
            wakes: recipients.map(({ agentId }) => ({ agentId, serverId: input.serverId })),
        };
    });
}
