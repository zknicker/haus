import type {
    AgentActivityEvent,
    AgentSendReceipt,
    HausAgentMessage,
    ServerDurableEvent,
} from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { followAgentThread } from '../agent-api/attention.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { settleAskForReply } from '../asks/settle-ask.ts';
import {
    associateMessageAttachments,
    attachmentMetadata,
    requireAgentMessageAttachments,
} from '../attachments/message-attachments.ts';
import { type AttributedMessageCause, insertMessageCause } from '../automations/message-cause.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, chatEventsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { appendServerAgentActivity } from '../server-agents/agent-activity.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { autoFollowThreadMentions } from '../threads/thread-attention.ts';
import { allocateEventCursor } from './allocate-event-cursor.ts';
import { canonicalizeAgentMessageContentForPersistence } from './canonicalize-agent-references.ts';
import { requireChatWritable } from './chat-access.ts';
import { readInlineReplyContext, resolveInlineReplyParent } from './reply-context.ts';
import {
    readExistingAgentMessage,
    replayAgentMessage,
    toAgentCliMessage,
} from './send-agent-message-replay.ts';

const maxAgentMessageContentLength = 32_000;

export interface SendAgentMessageInput {
    agentId: string;
    attachmentIds: string[];
    /**
     * The Trigger or Reminder fire this message answers, already owner-checked,
     * with how the Server learned it.
     */
    cause?: AttributedMessageCause;
    chatId: string;
    content: string;
    nonce: string;
    /** Optional direct parent of an inline reply; the Server derives its root. */
    replyToMessageId?: string;
    runId: string;
    serverId: string;
    /** The grammar target the Agent believes it answered; recorded for fidelity. */
    target: string;
}

export interface SendAgentMessageResult {
    activities: AgentActivityEvent[];
    events: ServerDurableEvent[];
    message: HausAgentMessage;
    receipt: AgentSendReceipt;
    wakes: Array<{ agentId: string; serverId: string }>;
}

/**
 * Writes one durable Agent-authored message into the Server-resolved target.
 * The runner credential fixes the author and Server; the Agent API resolves the
 * grammar target and access before calling here. Idempotency is `(chat, nonce)`.
 */
export async function sendAgentMessage(
    db: HausDatabase,
    input: SendAgentMessageInput,
    agentDelivery: AgentDelivery
): Promise<SendAgentMessageResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${input.chatId}
            for update
        `);
        await requireChatWritable(tx, input);
        const replyParent = input.replyToMessageId
            ? await resolveInlineReplyParent(tx, {
                  chatId: input.chatId,
                  replyToMessageId: input.replyToMessageId,
                  serverId: input.serverId,
              })
            : null;
        const [agent] = await tx
            .select({
                description: agentsTable.description,
                displayName: agentsTable.displayName,
                handle: agentsTable.handle,
                sessionGeneration: agentsTable.sessionGeneration,
            })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .limit(1);
        if (!agent) {
            throw new Error('The Agent no longer exists.');
        }

        const existing = await readExistingAgentMessage(tx, input);
        const content =
            existing?.content === input.content
                ? input.content
                : await canonicalizeAgentMessageContentForPersistence(tx, {
                      content: input.content,
                      existingContent: existing?.content,
                      serverId: input.serverId,
                  });
        if (content.length > maxAgentMessageContentLength) {
            throw new AgentMessageContentTooLongError();
        }

        if (existing) {
            return await replayAgentMessage(
                tx,
                input,
                agent,
                existing,
                content,
                replyParent?.parent.id ?? null
            );
        }
        const activities: AgentActivityEvent[] = [];
        const startedActivity = await appendServerAgentActivity(tx, {
            agentId: input.agentId,
            category: 'sending_message',
            phase: 'started',
            runId: input.runId,
            serverId: input.serverId,
        });
        if (startedActivity) {
            activities.push(startedActivity);
        }
        const attachments = await requireAgentMessageAttachments(tx, input.agentId, {
            attachmentIds: input.attachmentIds,
            chatId: input.chatId,
            serverId: input.serverId,
        });

        const [updatedChat] = await tx
            .update(chatsTable)
            .set({
                lastActivityAt: sql`now()`,
                lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
            })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
            .returning({ sequence: chatsTable.lastMessageSequence });
        if (!updatedChat) {
            throw new Error('Failed to allocate the Agent message sequence.');
        }

        const messageId = createOpaqueId('msg');
        const [message] = await tx
            .insert(chatMessagesTable)
            .values({
                authorAgentId: input.agentId,
                chatId: input.chatId,
                content,
                id: messageId,
                nonce: input.nonce,
                replyRootMessageId: replyParent?.root.id ?? messageId,
                replyToMessageId: replyParent?.parent.id ?? null,
                runId: input.runId,
                sequence: updatedChat.sequence,
                serverId: input.serverId,
                sessionGeneration: agent.sessionGeneration,
            })
            .returning();
        await associateMessageAttachments(tx, attachments, message.id, input.chatId);
        if (input.cause) {
            await insertMessageCause(tx, {
                attribution: input.cause.attribution,
                cause: input.cause.fire,
                messageId: message.id,
                serverId: input.serverId,
            });
        }

        const [writtenChat] = await tx
            .select({
                anchorMessageId: chatsTable.anchorMessageId,
                kind: chatsTable.kind,
                parentChatId: chatsTable.parentChatId,
            })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
            .limit(1);
        if (writtenChat?.kind === 'thread') {
            await followAgentThread(tx, {
                agentId: input.agentId,
                serverId: input.serverId,
                threadChatId: input.chatId,
            });
            if (writtenChat.parentChatId) {
                await autoFollowThreadMentions(tx, {
                    content,
                    parentChatId: writtenChat.parentChatId,
                    serverId: input.serverId,
                    threadChatId: input.chatId,
                });
            }
        }
        // An Agent reply in an Ask's Thread settles that Ask, unless it is the
        // asking Agent's own reply. Settlement commits with the reply.
        const settledAsk =
            writtenChat?.kind === 'thread'
                ? await settleAskForReply(tx, {
                      anchorMessageId: writtenChat.anchorMessageId,
                      answeredBy: { id: input.agentId, kind: 'agent' },
                      answerMessageId: message.id,
                      replySequence: message.sequence,
                      serverId: input.serverId,
                      threadChatId: input.chatId,
                  })
                : null;

        const recipients = await planAgentMessageRecipients(tx, {
            authorAgentId: input.agentId,
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
                source: `agent:${agent.handle}`,
                threadFollowReactivated: recipient.threadFollowReactivated,
            });
        }

        const eventCursor = await allocateEventCursor(tx, input.serverId);
        const [event] = await tx
            .insert(chatEventsTable)
            .values({
                chatId: input.chatId,
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

        const completedActivity = await appendServerAgentActivity(tx, {
            agentId: input.agentId,
            category: 'sending_message',
            phase: 'completed',
            runId: input.runId,
            serverId: input.serverId,
        });
        if (completedActivity) {
            activities.push(completedActivity);
        }

        return {
            activities,
            events: [
                {
                    chatId: input.chatId,
                    createdAt: event.createdAt.toISOString(),
                    cursor: event.cursor.toString(),
                    id: event.id,
                    messageId: message.id,
                    parentChatId: writtenChat?.kind === 'thread' ? writtenChat.parentChatId : null,
                    sequence: message.sequence,
                    serverId: input.serverId,
                    type: 'message.created',
                },
                ...(settledAsk ? [settledAsk] : []),
            ],
            message: toAgentCliMessage(message, {
                ...agent,
                agentId: input.agentId,
                attachments: attachmentMetadata(attachments),
                chatId: input.chatId,
                reply: await readInlineReplyContext(tx, input.serverId, message),
            }),
            receipt: {
                chatId: input.chatId,
                idempotent: false,
                messageId: message.id,
                sequence: message.sequence,
                target: input.target,
            },
            wakes: recipients.map(({ agentId }) => ({ agentId, serverId: input.serverId })),
        };
    });
}

export class AgentSendConflictError extends Error {
    constructor() {
        super('That message nonce already belongs to a different Agent send.');
        this.name = 'AgentSendConflictError';
    }
}

export class AgentMessageContentTooLongError extends Error {
    constructor() {
        super('The message is too long after rich references are resolved.');
        this.name = 'AgentMessageContentTooLongError';
    }
}
