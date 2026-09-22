import type { MessageBodyKind, ServerDurableEvent } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { followAgentThread } from '../agent-api/attention.ts';
import { resolveAgentSendTarget } from '../agent-api/resolve-send-target.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { ensureThreadRecord } from '../threads/ensure-thread.ts';
import { autoFollowThreadMentions } from '../threads/thread-attention.ts';
import { requireChatWritable } from './chat-access.ts';
import { insertMessageCreatedEvent } from './message-created-event.ts';
import { resolveInlineReplyParent } from './reply-context.ts';

export interface AgentAuthoredMessageChat {
    kind: 'channel' | 'dm' | 'thread';
    parentChatId: string | null;
}

export interface AgentAuthoredMessagePlan {
    agentHandle: string;
    chat: AgentAuthoredMessageChat;
    chatId: string;
}

export interface AgentAuthoredMessage {
    chat: AgentAuthoredMessageChat;
    chatId: string;
    event: ServerDurableEvent;
    messageId: string;
    sequence: number;
    /** The conversation any answer or discussion happens in. */
    threadChatId: string;
    wakes: Array<{ agentId: string; serverId: string }>;
}

export class AgentAuthorNotFoundError extends Error {
    constructor(message = 'The authoring Agent no longer exists.') {
        super(message);
        this.name = 'AgentAuthorNotFoundError';
    }
}

/**
 * Resolves and validates everything a record-backed Agent Message needs before
 * the first write: the target Chat, that it is writable, and the live Agent.
 * Every record kind runs this first so an invalid launch creates nothing.
 */
export async function planAgentAuthoredMessage(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<AgentAuthoredMessagePlan> {
    const chatId = await resolveAgentSendTarget(db, runner, target);
    await requireChatWritable(db, { chatId, serverId: runner.serverId });
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.id, runner.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new AgentAuthorNotFoundError();
    }
    const [chat] = await db
        .select({ kind: chatsTable.kind, parentChatId: chatsTable.parentChatId })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        throw new Error('The target Chat no longer exists.');
    }
    return { agentHandle: agent.handle, chat, chatId };
}

/**
 * Writes one Agent-authored Message that a Server record anchors: the numbered
 * Message carrying its typed body kind, the deterministic child Thread when the
 * Message is top-level, the authoring Agent's follow on the conversation the
 * discussion happens in, ordinary delivery planning, and `message.created`.
 * The caller inserts its own record and event inside the same transaction.
 */
export async function writeAgentAuthoredMessage(
    db: HausDatabase,
    runner: ResolvedRunner,
    plan: AgentAuthoredMessagePlan,
    input: { bodyKind: MessageBodyKind; content: string; nonce: string; replyToMessageId?: string },
    agentDelivery: AgentDelivery
): Promise<AgentAuthoredMessage> {
    const reply = input.replyToMessageId
        ? await resolveInlineReplyParent(db, {
              chatId: plan.chatId,
              replyToMessageId: input.replyToMessageId,
              serverId: runner.serverId,
          })
        : null;
    const [numbered] = await db
        .update(chatsTable)
        .set({
            lastActivityAt: sql`now()`,
            lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1`,
        })
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, plan.chatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    if (!numbered) {
        throw new Error('Failed to allocate the message sequence.');
    }

    const [message] = await db
        .insert(chatMessagesTable)
        .values({
            authorAgentId: runner.agentId,
            bodyKind: input.bodyKind,
            chatId: plan.chatId,
            content: input.content,
            id: createOpaqueId('msg'),
            nonce: input.nonce,
            replyToMessageId: reply?.parent.id ?? null,
            replyRootMessageId: reply?.root.id ?? null,
            runId: runner.runId,
            sequence: numbered.sequence,
            serverId: runner.serverId,
        })
        .returning();

    // A top-level Message receives its child Thread immediately; one posted
    // inside a Thread stays there, because Threads do not nest. Either way the
    // authoring Agent follows the conversation that answers it.
    const threadChatId =
        plan.chat.kind === 'thread'
            ? plan.chatId
            : (
                  await ensureThreadRecord(db, {
                      anchorMessageId: message.id,
                      parentChatId: plan.chatId,
                      serverId: runner.serverId,
                  })
              ).id;
    await followAgentThread(db, {
        agentId: runner.agentId,
        serverId: runner.serverId,
        threadChatId,
    });
    if (plan.chat.kind === 'thread' && plan.chat.parentChatId) {
        await autoFollowThreadMentions(db, {
            content: input.content,
            parentChatId: plan.chat.parentChatId,
            serverId: runner.serverId,
            threadChatId: plan.chatId,
        });
    }

    const recipients = await planAgentMessageRecipients(db, {
        authorAgentId: runner.agentId,
        chatId: plan.chatId,
        content: input.content,
        messageId: message.id,
        serverId: runner.serverId,
    });
    for (const recipient of recipients) {
        await agentDelivery.enqueue(db, {
            addressedReason: recipient.addressedReason,
            agentId: recipient.agentId,
            chatId: plan.chatId,
            content: input.content,
            dedupeKey: message.id,
            mentioned: recipient.mentioned,
            sequence: message.sequence,
            serverId: runner.serverId,
            source: `agent:${plan.agentHandle}`,
            threadFollowReactivated: recipient.threadFollowReactivated,
        });
    }

    return {
        chat: plan.chat,
        chatId: plan.chatId,
        event: await insertMessageCreatedEvent(db, {
            chat: plan.chat,
            message,
            serverId: runner.serverId,
        }),
        messageId: message.id,
        sequence: message.sequence,
        threadChatId,
        wakes: recipients.map(({ agentId }) => ({ agentId, serverId: runner.serverId })),
    };
}

/** The Message an Agent already wrote under this nonce, for replay checks. */
export async function findAgentMessageByNonce(
    db: HausDatabase,
    input: { chatId: string; nonce: string; serverId: string }
): Promise<{
    authorAgentId: string | null;
    content: string;
    id: string;
    sequence: number;
    replyToMessageId: string | null;
} | null> {
    const [message] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            content: chatMessagesTable.content,
            id: chatMessagesTable.id,
            replyToMessageId: chatMessagesTable.replyToMessageId,
            sequence: chatMessagesTable.sequence,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.nonce, input.nonce)
            )
        )
        .limit(1);
    return message ?? null;
}
