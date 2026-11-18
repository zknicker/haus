import type { AgentDeliveriesInput, AgentDeliveryRecord } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireAgent } from './agent-delivery-control.ts';

/**
 * One Agent's delivery ledger, newest first. Rows settled as `seen` are kept
 * with the turn that consumed them, so "never delivered" and "delivered and
 * answered with silence" read differently here.
 */
export async function listAgentDeliveries(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentDeliveriesInput
): Promise<AgentDeliveryRecord[]> {
    await requireServerMembership(db, member, input.serverId);
    await requireAgent(db, input);

    const rows = await db
        .select({
            acceptedAt: agentInboxTable.acceptedAt,
            chatId: agentInboxTable.chatId,
            createdAt: agentInboxTable.createdAt,
            messageId: agentInboxTable.dedupeKey,
            source: agentInboxTable.source,
            seenAt: agentInboxTable.seenAt,
            servedAt: agentInboxTable.servedAt,
            state: agentInboxTable.state,
            turnId: agentInboxTable.settledRunId,
            workId: agentInboxTable.dedupeKey,
        })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, input.serverId),
                eq(agentInboxTable.agentId, input.agentId)
            )
        )
        .orderBy(desc(agentInboxTable.createdAt))
        .limit(input.limit);

    return rows.map((row) => ({
        ...row,
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        agentId: input.agentId,
        createdAt: row.createdAt.toISOString(),
        seenAt: row.seenAt?.toISOString() ?? null,
        servedAt: row.servedAt?.toISOString() ?? null,
    }));
}
