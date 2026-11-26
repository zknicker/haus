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

    const captainChat = alias(chatsTable, 'captain_chat');
    const rows = await db
        .select({
            activeRunId: agentDeliveryTable.activeRunId,
            avatarId: agentsTable.avatarId,
            computerId: agentsTable.computerId,
            connectionAdmin: agentsTable.connectionAdmin,
            modelConnectionId: agentsTable.modelConnectionId,
            createdByAgentId: agentsTable.createdByAgentId,
            createdByUserId: agentsTable.createdByUserId,
            computerHealth: computersTable.health,
            createdAt: agentsTable.createdAt,
            description: agentsTable.description,
            desiredModelId: agentsTable.desiredModelId,
            desiredReasoningEffort: agentsTable.desiredReasoningEffort,
            desiredRuntimeId: agentsTable.desiredRuntimeId,
            displayName: agentsTable.displayName,
            captainChatId: captainChat.id,
            crewComputerId: agentsTable.crewComputerId,
            crewModel: agentsTable.crewModel,
            ownerUserId: agentsTable.ownerUserId,
            effectiveBackgroundSubagents: agentsTable.effectiveBackgroundSubagents,
            effectiveHausAgentAppliedAt: agentsTable.effectiveHausAgentAppliedAt,
            effectiveHausAgentStatus: agentsTable.effectiveHausAgentStatus,
            effectiveHausAgentVersion: agentsTable.effectiveHausAgentVersion,
            effectiveMissing: agentsTable.effectiveMissing,
            effectiveModelId: agentsTable.effectiveModelId,
            effectiveReasoningEffort: agentsTable.effectiveReasoningEffort,
            effectiveReportedAt: agentsTable.effectiveReportedAt,
            effectiveRuntimeId: agentsTable.effectiveRuntimeId,
            handle: agentsTable.handle,
            id: agentsTable.id,
            serverId: agentsTable.serverId,
            stopped: agentDeliveryTable.stopped,
            ...wakePauseColumns,
        })
        .from(agentsTable)
        .leftJoin(
            captainChat,
            and(
                eq(captainChat.serverId, agentsTable.serverId),
                eq(captainChat.captainAgentId, agentsTable.id),
                eq(captainChat.kind, 'captain')
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
                isNull(agentsTable.retiredAt),
                eq(agentsTable.kind, 'captain')
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
