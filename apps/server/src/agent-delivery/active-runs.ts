import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentsTable } from '../postgres/schema.ts';

export async function listActiveRunAgents(db: HausDatabase) {
    return await db
        .select({ agentId: agentDeliveryTable.agentId, serverId: agentDeliveryTable.serverId })
        .from(agentDeliveryTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentDeliveryTable.serverId),
                eq(agentsTable.id, agentDeliveryTable.agentId)
            )
        )
        .where(and(isNotNull(agentDeliveryTable.activeRunId), isNull(agentsTable.retiredAt)));
}
