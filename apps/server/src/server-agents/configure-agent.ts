import {
    type Agent,
    type AgentActivityEvent,
    type ConfigureAgentInput,
    reasoningChangeResetsSession,
} from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { recordSessionRotation } from '../agent-delivery/session-rotation.ts';
import * as deliveryStore from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDeliveryTable,
    agentMessageDraftsTable,
    agentsTable,
    chatsTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';
import { assertRuntimeModelReported, resolveAssignedComputer } from './agent-inventory.ts';
import { type ConfiguredAgentRow, toAgent } from './agent-shape.ts';

export interface AgentConfigurationRotation {
    activity: AgentActivityEvent | null;
    chatId: string | null;
    computerId: string;
    deferred: boolean;
    runId: string | null;
    sessionGeneration: number;
}

export interface ConfigureAgentResult {
    agent: Agent;
    rotation: AgentConfigurationRotation | null;
}

/**
 * Changes an Agent's desired runtime/model on its existing Computer. The
 * Computer assignment is immutable and absent from the input, and the new pair
 * is validated only against that same Computer's last-reported inventory — so
 * an offline Computer's saved config still fails closed on a cross-Computer or
 * unreported reference.
 */
export async function configureAgent(
    db: HausDatabase,
    member: HausUser | null,
    input: ConfigureAgentInput
): Promise<ConfigureAgentResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);

        if (!member) {
            throw new AgentConfigDeniedError('Sign in to configure an Agent.');
        }

        if (server.role !== 'owner' && server.role !== 'admin') {
            throw new AgentConfigDeniedError(
                'Only a Server Owner or Admin can configure an Agent.'
            );
        }

        const [agent] = await tx
            .select({
                computerId: agentsTable.computerId,
                createdByAgentId: agentsTable.createdByAgentId,
                createdByUserId: agentsTable.createdByUserId,
                desiredModelId: agentsTable.desiredModelId,
                desiredReasoningEffort: agentsTable.desiredReasoningEffort,
                desiredRuntimeId: agentsTable.desiredRuntimeId,
                factoryAppliedAt: agentsTable.factoryAppliedAt,
                factoryKind: agentsTable.factoryKind,
            })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .limit(1);

        if (!agent?.computerId) {
            throw new AgentConfigDeniedError('No configured Agent exists with that id.');
        }
        if (agent.factoryKind === 'cove' && !agent.factoryAppliedAt) {
            throw new AgentConfigDeniedError(
                'Cove setup must finish before configuration changes.'
            );
        }

        const { health: computerHealth, inventory } = await resolveAssignedComputer(tx, {
            computerId: agent.computerId,
            serverId: input.serverId,
        });
        const desiredReasoningEffort = input.reasoningEffort ?? agent.desiredReasoningEffort;
        assertRuntimeModelReported(
            inventory,
            input.runtimeId,
            input.modelId,
            desiredReasoningEffort
        );
        const changed =
            agent.desiredRuntimeId !== input.runtimeId ||
            agent.desiredModelId !== input.modelId ||
            agent.desiredReasoningEffort !== desiredReasoningEffort;
        const delivery = await deliveryStore.readDeliveryState(tx, input.agentId);
        const hasActiveRun = Boolean(delivery?.activeRunId);
        const deferred =
            hasActiveRun &&
            (delivery?.activeRunModelId !== input.modelId ||
                delivery.activeRunRuntimeId !== input.runtimeId ||
                delivery.activeRunReasoningEffort !== desiredReasoningEffort);
        const rotateNow =
            !hasActiveRun &&
            (agent.desiredRuntimeId !== input.runtimeId ||
                agent.desiredModelId !== input.modelId ||
                (reasoningChangeResetsSession(input.runtimeId) &&
                    agent.desiredReasoningEffort !== desiredReasoningEffort));

        const [configured] = await tx
            .update(agentsTable)
            .set({
                desiredModelId: input.modelId,
                ...(input.reasoningEffort ? { desiredReasoningEffort: input.reasoningEffort } : {}),
                desiredRuntimeId: input.runtimeId,
                ...(rotateNow
                    ? {
                          sessionGeneration: sql`${agentsTable.sessionGeneration} + 1`,
                          sessionResetKind: 'session' as const,
                      }
                    : {}),
            })
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .returning({ sessionGeneration: agentsTable.sessionGeneration });
        if (!configured) {
            throw new AgentConfigDeniedError('No configured Agent exists with that id.');
        }

        let rotation: AgentConfigurationRotation | null = null;
        if (changed || deferred) {
            if (rotateNow) {
                await tx
                    .delete(agentMessageDraftsTable)
                    .where(eq(agentMessageDraftsTable.agentId, input.agentId));
                await recordSessionRotation(tx, {
                    agentId: input.agentId,
                    generation: configured.sessionGeneration,
                    reason: 'configuration',
                    serverId: input.serverId,
                });
            }
            rotation = {
                activity: null,
                chatId: delivery?.activeRunChatId ?? null,
                computerId: agent.computerId,
                deferred,
                runId: rotateNow ? (delivery?.activeRunId ?? null) : null,
                sessionGeneration: configured.sessionGeneration,
            };
        }

        const agentDm = alias(chatsTable, 'agent_dm');
        const [row] = await tx
            .select({
                activeRunId: agentDeliveryTable.activeRunId,
                avatarId: agentsTable.avatarId,
                computerId: agentsTable.computerId,
                createdByAgentId: agentsTable.createdByAgentId,
                createdByUserId: agentsTable.createdByUserId,
                consecutiveFailures: agentDeliveryTable.consecutiveFailures,
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
            .leftJoin(agentDeliveryTable, eq(agentDeliveryTable.agentId, agentsTable.id))
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .limit(1);

        if (!row) {
            throw new AgentConfigDeniedError('No configured Agent exists with that id.');
        }

        return {
            agent: toAgent({
                ...row,
                activeRunId: row.activeRunId ?? null,
                computerHealth,
                createdByUserId: row.createdByUserId ?? null,
                consecutiveFailures: row.consecutiveFailures ?? 0,
                stopped: row.stopped ?? false,
            } satisfies ConfiguredAgentRow),
            rotation,
        };
    });
}
