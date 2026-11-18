import type { AddressedReason } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentChannelMutesTable,
    agentsTable,
    agentTaskFollowsTable,
    channelAgentParticipantsTable,
    chatsTable,
} from '../postgres/schema.ts';
import { isFollowedChatKind } from './followed-chat.ts';
import { planInlineReplyMessage } from './inline-reply-recipients.ts';
import { followMentionedIntoTask } from './task-recipients.ts';

export interface AgentMessageRecipientPlan {
    /**
     * Why this delivery names the Agent personally: a DM, an @mention, a
     * committed Jev routing, or the sole Agent of a one-human channel. Null is an
     * ordinary ambient delivery.
     */
    addressedReason: AddressedReason | null;
    agentId: string;
    mentioned: boolean;
    taskFollowReactivated: boolean;
}

export async function planAgentMessageRecipients(
    db: HausDatabase,
    input: {
        authorAgentId: string | null;
        chatId: string;
        content: string;
        messageId?: string;
        serverId: string;
    }
): Promise<AgentMessageRecipientPlan[]> {
    const [chat] = await db
        .select({
            dmAgentId: chatsTable.dmAgentId,
            kind: chatsTable.kind,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat) {
        return [];
    }
    const messageId = input.messageId;
    const inlineReplyRecipients = messageId
        ? await planInlineReplyMessage(db, { ...input, messageId })
        : null;
    if (inlineReplyRecipients) {
        return inlineReplyRecipients;
    }
    if (chat.kind === 'dm') {
        return chat.dmAgentId && chat.dmAgentId !== input.authorAgentId
            ? await activeDmRecipient(db, input.serverId, chat.dmAgentId)
            : [];
    }

    const followerGated = isFollowedChatKind(chat.kind);
    const parentChatId = followerGated ? chat.parentChatId : input.chatId;
    if (!parentChatId) {
        return [];
    }
    const joined = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, channelAgentParticipantsTable.serverId),
                eq(agentsTable.id, channelAgentParticipantsTable.agentId)
            )
        )
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, input.serverId),
                eq(channelAgentParticipantsTable.chatId, parentChatId),
                isNull(agentsTable.retiredAt)
            )
        );
    const agentIds = joined
        .map((row) => row.agentId)
        .filter((agentId) => agentId !== input.authorAgentId);
    if (agentIds.length === 0) {
        return [];
    }
    // Sequential, not Promise.all: `db` is often the caller's transaction, and
    // overlapping reads on that one connection deadlocked the send against the
    // Server row lock the same transaction already held.
    const agents = await db
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), inArray(agentsTable.id, agentIds)));
    const mutes = await db
        .select({ agentId: agentChannelMutesTable.agentId })
        .from(agentChannelMutesTable)
        .where(
            and(
                eq(agentChannelMutesTable.serverId, input.serverId),
                eq(agentChannelMutesTable.chatId, parentChatId),
                inArray(agentChannelMutesTable.agentId, agentIds)
            )
        );
    const follows = followerGated
        ? await db
              .select({
                  agentId: agentTaskFollowsTable.agentId,
                  followed: agentTaskFollowsTable.followed,
              })
              .from(agentTaskFollowsTable)
              .where(
                  and(
                      eq(agentTaskFollowsTable.serverId, input.serverId),
                      eq(agentTaskFollowsTable.taskChatId, input.chatId),
                      inArray(agentTaskFollowsTable.agentId, agentIds)
                  )
              )
        : [];
    const muted = new Set(mutes.map((row) => row.agentId));
    const followByAgent = new Map(follows.map((row) => [row.agentId, row.followed]));
    const mentioned = mentionedAgentIds(input.content, agents);
    const reactivated = followerGated
        ? await followMentionedIntoTask(db, {
              agentIds,
              causeMessageId: input.messageId ?? null,
              followByAgent,
              mentioned,
              serverId: input.serverId,
              taskChatId: input.chatId,
          })
        : new Set<string>();

    return agentIds.flatMap((agentId) => {
        const isMentioned = mentioned.has(agentId);
        const isMuted = !followerGated && muted.has(agentId);
        const followed = !followerGated || followByAgent.get(agentId) === true;
        if (!isMentioned && (isMuted || !followed)) {
            return [];
        }
        return [
            {
                addressedReason: isMentioned ? 'mention' : null,
                agentId,
                mentioned: isMentioned,
                taskFollowReactivated: reactivated.has(agentId),
            },
        ];
    });
}

/**
 * A retired Agent keeps its durable DM history but can never receive new work,
 * so a DM resolves a recipient only while the Agent is active.
 */
async function activeDmRecipient(
    db: HausDatabase,
    serverId: string,
    agentId: string
): Promise<AgentMessageRecipientPlan[]> {
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(agentsTable.id, agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    return agent
        ? [{ addressedReason: 'dm', agentId, mentioned: false, taskFollowReactivated: false }]
        : [];
}
