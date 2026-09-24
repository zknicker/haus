import type { AddressedReason } from '@haus/api';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentChannelMutesTable,
    agentsTable,
    agentThreadFollowsTable,
    channelAgentParticipantsTable,
    chatsTable,
} from '../postgres/schema.ts';
import { planInlineReplyMessage } from './inline-reply-recipients.ts';

export interface AgentMessageRecipientPlan {
    /**
     * Why this delivery names the Agent personally: a DM, an @mention, a
     * committed Jev routing, or the sole Agent of a one-human channel. Null is an
     * ordinary ambient delivery.
     */
    addressedReason: AddressedReason | null;
    agentId: string;
    /** Jev's reply-expectation judgment for a routed human message (ADR 0035). */
    expectsReply?: number | null;
    mentioned: boolean;
    threadFollowReactivated: boolean;
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

    const parentChatId = chat.kind === 'thread' ? chat.parentChatId : input.chatId;
    if (!parentChatId) {
        return [];
    }
    if (chat.kind === 'thread') {
        const [parent] = await db
            .select({ dmAgentId: chatsTable.dmAgentId, kind: chatsTable.kind })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, parentChatId)))
            .limit(1);
        if (parent?.kind === 'dm') {
            return parent.dmAgentId && parent.dmAgentId !== input.authorAgentId
                ? await activeDmThreadRecipient(db, {
                      agentId: parent.dmAgentId,
                      content: input.content,
                      serverId: input.serverId,
                      threadChatId: input.chatId,
                  })
                : [];
        }
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
    const follows =
        chat.kind === 'thread'
            ? await db
                  .select({
                      agentId: agentThreadFollowsTable.agentId,
                      followed: agentThreadFollowsTable.followed,
                  })
                  .from(agentThreadFollowsTable)
                  .where(
                      and(
                          eq(agentThreadFollowsTable.serverId, input.serverId),
                          eq(agentThreadFollowsTable.threadChatId, input.chatId),
                          inArray(agentThreadFollowsTable.agentId, agentIds)
                      )
                  )
            : [];
    const muted = new Set(mutes.map((row) => row.agentId));
    const followByAgent = new Map(follows.map((row) => [row.agentId, row.followed]));
    const mentioned = mentionedAgentIds(input.content, agents);
    const reactivated = new Set<string>();

    if (chat.kind === 'thread') {
        for (const agentId of mentioned) {
            const previousFollow = followByAgent.get(agentId);
            if (agentIds.includes(agentId) && previousFollow !== true) {
                await db
                    .insert(agentThreadFollowsTable)
                    .values({
                        agentId,
                        serverId: input.serverId,
                        threadChatId: input.chatId,
                    })
                    .onConflictDoUpdate({
                        set: { followed: true, updatedAt: sql`now()` },
                        target: [
                            agentThreadFollowsTable.serverId,
                            agentThreadFollowsTable.agentId,
                            agentThreadFollowsTable.threadChatId,
                        ],
                    });
                if (previousFollow === false) {
                    reactivated.add(agentId);
                }
                followByAgent.set(agentId, true);
            }
        }
    }

    return agentIds.flatMap((agentId) => {
        const isMentioned = mentioned.has(agentId);
        const isMuted = chat.kind !== 'thread' && muted.has(agentId);
        const followed = chat.kind !== 'thread' || followByAgent.get(agentId) === true;
        if (!isMentioned && (isMuted || !followed)) {
            return [];
        }
        return [
            {
                addressedReason: isMentioned ? 'mention' : null,
                agentId,
                mentioned: isMentioned,
                threadFollowReactivated: reactivated.has(agentId),
            },
        ];
    });
}

/**
 * A retired Agent keeps its durable DM history but can never receive new work,
 * so a DM (or a DM Thread) resolves a recipient only while the Agent is active.
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
        ? [{ addressedReason: 'dm', agentId, mentioned: false, threadFollowReactivated: false }]
        : [];
}

async function activeDmThreadRecipient(
    db: HausDatabase,
    input: { agentId: string; content: string; serverId: string; threadChatId: string }
): Promise<AgentMessageRecipientPlan[]> {
    const [agent] = await db
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        return [];
    }
    const [follow] = await db
        .select({ followed: agentThreadFollowsTable.followed })
        .from(agentThreadFollowsTable)
        .where(
            and(
                eq(agentThreadFollowsTable.serverId, input.serverId),
                eq(agentThreadFollowsTable.agentId, input.agentId),
                eq(agentThreadFollowsTable.threadChatId, input.threadChatId)
            )
        )
        .limit(1);
    const mentioned = mentionedAgentIds(input.content, [agent]).has(input.agentId);
    if (follow?.followed === false && !mentioned) {
        return [];
    }
    const reactivated = follow?.followed === false;
    if (follow?.followed !== true) {
        await db
            .insert(agentThreadFollowsTable)
            .values({
                agentId: input.agentId,
                serverId: input.serverId,
                threadChatId: input.threadChatId,
            })
            .onConflictDoUpdate({
                set: { followed: true, updatedAt: sql`now()` },
                target: [
                    agentThreadFollowsTable.serverId,
                    agentThreadFollowsTable.agentId,
                    agentThreadFollowsTable.threadChatId,
                ],
            });
    }
    return [
        {
            addressedReason: 'dm',
            agentId: input.agentId,
            mentioned,
            threadFollowReactivated: reactivated,
        },
    ];
}
