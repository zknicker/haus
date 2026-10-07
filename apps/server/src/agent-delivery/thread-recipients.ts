import { and, eq, isNull, sql } from 'drizzle-orm';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, agentThreadFollowsTable } from '../postgres/schema.ts';
import type { AgentMessageRecipientPlan } from './message-recipients.ts';

/**
 * Follows each mentioned, eligible Agent into the Thread. Returns the Agents
 * whose explicit unfollow the mention reversed; `followByAgent` is updated.
 */
export async function followMentionedIntoThread(
    db: HausDatabase,
    input: {
        agentIds: string[];
        causeMessageId: string | null;
        followByAgent: Map<string, boolean>;
        mentioned: Set<string>;
        serverId: string;
        threadChatId: string;
    }
): Promise<Set<string>> {
    const reactivated = new Set<string>();
    for (const agentId of input.mentioned) {
        const previousFollow = input.followByAgent.get(agentId);
        if (!input.agentIds.includes(agentId) || previousFollow === true) {
            continue;
        }
        await db
            .insert(agentThreadFollowsTable)
            .values({ agentId, serverId: input.serverId, threadChatId: input.threadChatId })
            .onConflictDoUpdate({
                set: { followed: true, updatedAt: sql`now()` },
                target: [
                    agentThreadFollowsTable.serverId,
                    agentThreadFollowsTable.agentId,
                    agentThreadFollowsTable.threadChatId,
                ],
            });
        // The mention that follows the Agent in stays unread.
        await openAgentChatRead(db, {
            agentId,
            causeMessageId: input.causeMessageId,
            chatId: input.threadChatId,
            serverId: input.serverId,
        });
        if (previousFollow === false) {
            reactivated.add(agentId);
        }
        input.followByAgent.set(agentId, true);
    }
    return reactivated;
}

/** A DM Thread's Agent, which follows the Thread on its first message there. */
export async function activeDmThreadRecipient(
    db: HausDatabase,
    input: {
        agentId: string;
        causeMessageId: string | null;
        content: string;
        serverId: string;
        threadChatId: string;
    }
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
        await openAgentChatRead(db, {
            agentId: input.agentId,
            causeMessageId: input.causeMessageId,
            chatId: input.threadChatId,
            serverId: input.serverId,
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
