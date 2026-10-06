import type { Agent } from '@haus/api';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { wakePauseColumns } from '../agent-delivery/failure-hold.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentsTable, chatsTable, computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { type ConfiguredAgentRow, toAgent } from './agent-shape.ts';

export async function queryAgents(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string,
    agentId?: string
): Promise<Agent[]> {
    await requireServerMembership(db, member, serverId);

    if (!member) {
        return [];
    }

    const agentDm = alias(chatsTable, 'agent_dm');
    const rows = await db
        .select({
            activeRunId: agentDeliveryTable.activeRunId,
            avatarId: agentsTable.avatarId,
            computerId: agentsTable.computerId,
            createdByAgentId: agentsTable.createdByAgentId,
            createdByUserId: agentsTable.createdByUserId,
            computerHealth: computersTable.health,
            createdAt: agentsTable.createdAt,
            description: agentsTable.description,
            desiredModelId: agentsTable.desiredModelId,
            desiredReasoningEffort: agentsTable.desiredReasoningEffort,
            desiredRuntimeId: agentsTable.desiredRuntimeId,
            displayName: agentsTable.displayName,
            dmChatId: agentDm.id,
            effectiveHausAgentAppliedAt: agentsTable.effectiveHausAgentAppliedAt,
            effectiveHausAgentStatus: agentsTable.effectiveHausAgentStatus,
            effectiveHausAgentVersion: agentsTable.effectiveHausAgentVersion,
            effectiveMissing: agentsTable.effectiveMissing,
            effectiveModelId: agentsTable.effectiveModelId,
            effectiveReasoningEffort: agentsTable.effectiveReasoningEffort,
            effectiveReportedAt: agentsTable.effectiveReportedAt,
            effectiveRuntimeId: agentsTable.effectiveRuntimeId,
            factoryKind: agentsTable.factoryKind,
            handle: agentsTable.handle,
            id: agentsTable.id,
            serverId: agentsTable.serverId,
            stopped: agentDeliveryTable.stopped,
            ...wakePauseColumns,
        })
        .from(agentsTable)
        .leftJoin(
            agentDm,
            and(
                eq(agentDm.serverId, agentsTable.serverId),
                eq(agentDm.dmAgentId, agentsTable.id),
                eq(agentDm.dmMemberOneUserId, member.id),
                eq(agentDm.kind, 'dm')
            )
        )
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, agentsTable.serverId),
                eq(computersTable.id, agentsTable.computerId)
            )
        )
        .leftJoin(agentDeliveryTable, eq(agentDeliveryTable.agentId, agentsTable.id))
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                agentId ? eq(agentsTable.id, agentId) : undefined,
                isNotNull(agentsTable.computerId),
                isNull(agentsTable.retiredAt)
            )
        )
        .orderBy(agentsTable.createdAt);

    return rows.map((row) =>
        toAgent({
            ...row,
            activeRunId: row.activeRunId ?? null,
            consecutiveFailures: row.consecutiveFailures ?? 0,
            stopped: row.stopped ?? false,
        } satisfies ConfiguredAgentRow)
    );
}
