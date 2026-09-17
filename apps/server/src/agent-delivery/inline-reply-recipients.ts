import { and, eq, inArray } from 'drizzle-orm';
import {
    ensureInlineReplyParticipants,
    listEligibleAgents,
    mentionedAgentIds,
} from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentChannelMutesTable,
    agentMessageFollowsTable,
    chatMessagesTable,
} from '../postgres/schema.ts';
import type { AgentMessageRecipientPlan } from './message-recipients.ts';

export async function planInlineReplyMessage(
    db: HausDatabase,
    input: {
        authorAgentId: string | null;
        chatId: string;
        content: string;
        messageId: string;
        serverId: string;
    }
): Promise<AgentMessageRecipientPlan[] | null> {
    const message = await readMessageReplyState(db, input.serverId, input.chatId, input.messageId);
    if (!message) {
        return null;
    }
    const rootMessageId = await ensureInlineReplyParticipants(db, input);
    return message.replyToMessageId
        ? await planInlineReplyRecipients(db, input, rootMessageId ?? message.id)
        : null;
}

async function planInlineReplyRecipients(
    db: HausDatabase,
    input: {
        authorAgentId: string | null;
        chatId: string;
        content: string;
        messageId?: string;
        serverId: string;
    },
    rootMessageId: string
): Promise<AgentMessageRecipientPlan[]> {
    const agents = await listEligibleAgents(db, {
        chatId: input.chatId,
        serverId: input.serverId,
    });
    if (agents.length === 0) {
        return [];
    }
    const follows = await db
        .select({
            agentId: agentMessageFollowsTable.agentId,
            followed: agentMessageFollowsTable.followed,
        })
        .from(agentMessageFollowsTable)
        .where(
            and(
                eq(agentMessageFollowsTable.serverId, input.serverId),
                eq(agentMessageFollowsTable.chatId, input.chatId),
                eq(agentMessageFollowsTable.rootMessageId, rootMessageId)
            )
        );
    const followedByAgent = new Map(follows.map((row) => [row.agentId, row.followed]));
    const agentIds = agents.map((agent) => agent.id);
    const mentioned = mentionedAgentIds(input.content, agents);
    const participated = follows.length > 0;
    const muted = participated
        ? new Set<string>()
        : new Set(
              (
                  await db
                      .select({ agentId: agentChannelMutesTable.agentId })
                      .from(agentChannelMutesTable)
                      .where(
                          and(
                              eq(agentChannelMutesTable.serverId, input.serverId),
                              eq(agentChannelMutesTable.chatId, input.chatId),
                              inArray(agentChannelMutesTable.agentId, agentIds)
                          )
                      )
              ).map((row) => row.agentId)
          );
    return agents.flatMap((agent) => {
        if (agent.id === input.authorAgentId) {
            return [];
        }
        const isMentioned = mentioned.has(agent.id);
        const receives = participated
            ? followedByAgent.get(agent.id) === true || isMentioned
            : !muted.has(agent.id) || isMentioned;
        return receives
            ? [{ agentId: agent.id, mentioned: isMentioned, threadFollowReactivated: false }]
            : [];
    });
}

async function readMessageReplyState(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    chatId: string,
    messageId: string
) {
    const [message] = await db
        .select({
            id: chatMessagesTable.id,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                eq(chatMessagesTable.chatId, chatId),
                eq(chatMessagesTable.id, messageId)
            )
        )
        .limit(1);
    return message ?? null;
}
