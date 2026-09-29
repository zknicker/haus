import type { DeleteAgentInput, ServerDurableEvent } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    agentMcpConnectionGrantsTable,
    agentRunnerCredentialsTable,
    agentsTable,
    channelAgentParticipantsTable,
    reminderAgentAttentionTable,
    remindersTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { clearTaskAssignments } from '../tasks/clear-task-assignments.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentDeleteDeniedError } from './agent-config-errors.ts';

/** Retires an Agent in the Server transaction; local Computer cleanup is never a prerequisite. */
export async function deleteAgent(
    db: HausDatabase,
    member: HausUser | null,
    input: DeleteAgentInput
): Promise<{ agentId: string; computerId: string; taskEvents: ServerDurableEvent[] }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
            throw new AgentDeleteDeniedError('Only a Server Owner or Admin can delete an Agent.');
        }
        const [agent] = await tx
            .select({
                computerId: agentsTable.computerId,
                displayName: agentsTable.displayName,
                id: agentsTable.id,
            })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.id, input.agentId),
                    isNull(agentsTable.retiredAt)
                )
            )
            .for('update');
        if (!agent) {
            throw new AgentDeleteDeniedError('That Agent no longer exists.');
        }
        if (!agent.computerId) {
            throw new AgentDeleteDeniedError('That Agent has no assigned Computer.');
        }
        if (input.confirmation !== agent.displayName) {
            throw new AgentDeleteDeniedError('Type the Agent name exactly to delete it.');
        }

        const owner = and(
            eq(agentDeliveryTable.serverId, input.serverId),
            eq(agentDeliveryTable.agentId, agent.id)
        );
        await tx
            .delete(agentRunnerCredentialsTable)
            .where(
                and(
                    eq(agentRunnerCredentialsTable.serverId, input.serverId),
                    eq(agentRunnerCredentialsTable.agentId, agent.id)
                )
            );
        await tx
            .delete(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.serverId, input.serverId),
                    eq(agentInboxTable.agentId, agent.id)
                )
            );
        await tx
            .delete(reminderAgentAttentionTable)
            .where(
                and(
                    eq(reminderAgentAttentionTable.serverId, input.serverId),
                    eq(reminderAgentAttentionTable.agentId, agent.id)
                )
            );
        await tx
            .update(remindersTable)
            .set({ status: 'canceled', updatedAt: new Date() })
            .where(
                and(
                    eq(remindersTable.serverId, input.serverId),
                    eq(remindersTable.ownerAgentId, agent.id),
                    eq(remindersTable.status, 'scheduled')
                )
            );
        await tx
            .delete(channelAgentParticipantsTable)
            .where(
                and(
                    eq(channelAgentParticipantsTable.serverId, input.serverId),
                    eq(channelAgentParticipantsTable.agentId, agent.id)
                )
            );
        await tx
            .delete(agentMcpConnectionGrantsTable)
            .where(
                and(
                    eq(agentMcpConnectionGrantsTable.serverId, input.serverId),
                    eq(agentMcpConnectionGrantsTable.agentId, agent.id)
                )
            );
        await tx.delete(agentDeliveryTable).where(owner);
        const taskEvents = await clearTaskAssignments(tx, input.serverId, agent.id);
        await tx
            .update(agentsTable)
            .set({
                effectiveHausAgentAppliedAt: null,
                effectiveHausAgentStatus: null,
                effectiveHausAgentVersion: null,
                effectiveMissing: null,
                effectiveModelId: null,
                effectiveReasoningEffort: null,
                effectiveReportedAt: null,
                effectiveRuntimeId: null,
                retiredAt: new Date(),
            })
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, agent.id)));
        return { agentId: agent.id, computerId: agent.computerId, taskEvents };
    });
}
