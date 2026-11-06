import { and, eq } from 'drizzle-orm';
import { followAgentThread } from '../agent-api/attention.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimsTable } from '../postgres/schema.ts';

type FollowWriter = Pick<HausDatabase, 'execute' | 'insert' | 'select'>;

/**
 * Promotion no longer creates a claim's Thread, so the claimant's attention has
 * to attach when the Thread finally exists. The moment the first reply
 * materializes a Thread whose anchor carries a claim, the claim's Agent assignee
 * and its Agent creator start following it — the same follows the old eager
 * promotion wrote, moved to the moment they can mean something.
 */
export async function followMaterializedClaimThread(
    db: FollowWriter,
    input: { anchorMessageId: string; serverId: string; threadChatId: string }
): Promise<void> {
    const [claim] = await db
        .select({
            assigneeAgentId: messageClaimsTable.assigneeAgentId,
            createdByAgentId: messageClaimsTable.createdByAgentId,
        })
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, input.serverId),
                eq(messageClaimsTable.messageId, input.anchorMessageId)
            )
        )
        .limit(1);
    if (!claim) {
        return;
    }
    const agentIds = [...new Set([claim.assigneeAgentId, claim.createdByAgentId])].filter(
        (agentId): agentId is string => agentId !== null
    );
    for (const agentId of agentIds) {
        await followAgentThread(db, {
            agentId,
            serverId: input.serverId,
            threadChatId: input.threadChatId,
        });
    }
}
