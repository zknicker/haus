import type { Agent } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentConfigurationRotation } from '../server-agents/configure-agent.ts';
import { publishCommittedAgentActivity } from './activity-events.ts';
import type { DeliveryTransport } from './delivery.ts';
import { type AgentConfigureRequest, readAgentDispatchConfig } from './dispatch-config.ts';
import { publishAgentLifecycle } from './lifecycle.ts';
import type { AgentLoopRoute } from './loop-host.ts';

export async function sendAgentConfiguration(
    db: HausDatabase,
    transport: DeliveryTransport,
    input: AgentConfigureRequest
) {
    const config = await readAgentDispatchConfig(db, input.agentId);
    if (!config) {
        return;
    }
    transport.send(input.computerId, {
        agentDescription: input.agentDescription,
        agentId: input.agentId,
        agentName: input.agentName,
        brief: config.brief,
        briefAuthorHandle: config.briefAuthorHandle,
        modelId: input.modelId,
        reasoningEffort: input.reasoningEffort,
        runtimeId: input.runtimeId,
        sessionGeneration: config.sessionGeneration,
        sessionResetKind: config.sessionResetKind,
        type: 'agent-configure',
    });
}

export async function applyConfiguration(
    deps: {
        configure: (input: AgentConfigureRequest) => Promise<void>;
        dispatchAgent: (agentId: string, serverId: string) => Promise<void>;
        route: AgentLoopRoute;
    },
    input: { agent: Agent; rotation: AgentConfigurationRotation | null }
) {
    const { agent, rotation } = input;
    if (rotation?.deferred) {
        return;
    }
    if (rotation?.activity) {
        publishCommittedAgentActivity(rotation.activity);
    }
    if (rotation?.runId) {
        publishAgentLifecycle({
            agentId: agent.id,
            chatId: rotation.chatId,
            outcome: 'stopped',
            phase: 'settled',
            runId: rotation.runId,
            serverId: agent.serverId,
        });
        deps.route.send(deps.route.hostOf(rotation.computerId), {
            agentId: agent.id,
            runId: rotation.runId,
            type: 'stop',
        });
    }
    await deps.configure({
        agentDescription: agent.description,
        agentId: agent.id,
        agentName: agent.displayName,
        computerId: agent.computerId,
        modelId: agent.desiredModelId,
        reasoningEffort: agent.desiredReasoningEffort,
        runtimeId: agent.desiredRuntimeId,
    });
    if (rotation) {
        await deps.dispatchAgent(agent.id, agent.serverId);
    }
}
