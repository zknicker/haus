import { type Agent, type AgentCommand, reasoningChangeResetsSession } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMessageDraftsTable, agentsTable } from '../postgres/schema.ts';
import type { DeliveryTransport } from './delivery.ts';
import { type AgentDispatchConfig, readAgentDispatchConfig } from './dispatch-config.ts';
import { recordSessionRotation } from './session-rotation.ts';

export interface DeferredConfiguration {
    agentId: string;
    config: ConfiguredAgent;
}

export function sendDeferredConfiguration(
    transport: DeliveryTransport,
    agentId: string,
    configuration: DeferredConfiguration
): void {
    transport.send(configuration.config.computerId, configureFrame(agentId, configuration.config));
}

/** Applies desired execution configuration only after the run using the old values settles. */
export async function rotateDeferredConfiguration(
    db: HausDatabase,
    input: {
        activeRunModelId: string | null;
        activeRunReasoningEffort: Agent['desiredReasoningEffort'] | null;
        activeRunRuntimeId: string | null;
        agentId: string;
        serverId: string;
    }
): Promise<DeferredConfiguration | null> {
    const config = await readAgentDispatchConfig(db, input.agentId);
    if (
        !isConfigured(config) ||
        (config.desiredModelId === input.activeRunModelId &&
            config.desiredRuntimeId === input.activeRunRuntimeId &&
            config.desiredReasoningEffort === input.activeRunReasoningEffort)
    ) {
        return null;
    }

    if (
        config.desiredModelId === input.activeRunModelId &&
        config.desiredRuntimeId === input.activeRunRuntimeId &&
        !reasoningChangeResetsSession(config.desiredRuntimeId)
    ) {
        return { agentId: input.agentId, config };
    }

    const [rotated] = await db
        .update(agentsTable)
        .set({
            sessionGeneration: sql`${agentsTable.sessionGeneration} + 1`,
            sessionResetKind: 'session',
        })
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .returning({ sessionGeneration: agentsTable.sessionGeneration });
    if (!rotated) {
        throw new Error('The Agent configuration session could not be rotated.');
    }

    await db
        .delete(agentMessageDraftsTable)
        .where(eq(agentMessageDraftsTable.agentId, input.agentId));
    await recordSessionRotation(db, {
        agentId: input.agentId,
        generation: rotated.sessionGeneration,
        reason: 'configuration',
        serverId: input.serverId,
    });
    const latestConfig = await readAgentDispatchConfig(db, input.agentId);
    if (!isConfigured(latestConfig)) {
        return null;
    }
    return { agentId: input.agentId, config: latestConfig };
}

export interface ConfiguredAgent {
    agentDescription: string | null;
    agentDisplayName: string;
    agentName: string;
    brief: string | null;
    briefAuthorHandle: string | null;
    computerId: string;
    desiredModelId: string;
    desiredReasoningEffort: Agent['desiredReasoningEffort'];
    desiredRuntimeId: string;
    factoryAppliedAt: Date | null;
    factoryKind: 'cove' | 'ordinary';
    homeTimezone: string;
    retiredAt: null;
    sessionGeneration: number;
    sessionResetKind: 'full' | 'session';
}

export function isConfigured(config: AgentDispatchConfig | null): config is ConfiguredAgent {
    return Boolean(
        config?.computerId &&
            config.desiredRuntimeId &&
            config.desiredModelId &&
            config.retiredAt === null &&
            (config.factoryKind === 'ordinary' || config.factoryAppliedAt)
    );
}

export function configureFrame(agentId: string, config: ConfiguredAgent): AgentCommand {
    return {
        agentDescription: config.agentDescription,
        agentId,
        agentName: config.agentDisplayName,
        brief: config.brief,
        briefAuthorHandle: config.briefAuthorHandle,
        factoryKind: config.factoryKind,
        modelId: config.desiredModelId,
        reasoningEffort: config.desiredReasoningEffort,
        runtimeId: config.desiredRuntimeId,
        sessionGeneration: config.sessionGeneration,
        sessionResetKind: config.sessionResetKind,
        type: 'agent-configure',
    };
}
