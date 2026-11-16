import { and, asc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { prepareClaimEvent } from './claim-events.ts';

type ClaimAssignmentWriter = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

/**
 * Releases claim ownership held by one departing Agent. The caller owns the
 * Server lock, so claim writers cannot race this selection or its ordered
 * updates.
 */
export async function clearClaimAssignments(
    db: ClaimAssignmentWriter,
    serverId: string,
    agentId: string
): Promise<PreparedRealtimeEvent[]> {
    const assigneeColumn = messageClaimsTable.assigneeAgentId;
    const assigned = await db
        .select({
            chatId: messageClaimsTable.chatId,
            messageId: messageClaimsTable.messageId,
            threadChatId: messageClaimsTable.threadChatId,
        })
        .from(messageClaimsTable)
        .where(and(eq(messageClaimsTable.serverId, serverId), eq(assigneeColumn, agentId)))
        .orderBy(asc(messageClaimsTable.messageId));
    const events: PreparedRealtimeEvent[] = [];

    for (const claim of assigned) {
        await db
            .update(messageClaimsTable)
            .set({
                assigneeAgentId: null,
                claimedAt: null,
                updatedAt: sql`now()`,
                version: sql`${messageClaimsTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageClaimsTable.serverId, serverId),
                    eq(messageClaimsTable.messageId, claim.messageId),
                    eq(assigneeColumn, agentId)
                )
            );
        events.push(
            prepareClaimEvent({
                chatId: claim.chatId,
                messageId: claim.messageId,
                serverId,
                threadChatId: claim.threadChatId,
                type: 'claim.updated',
            })
        );
    }

    return events;
}
