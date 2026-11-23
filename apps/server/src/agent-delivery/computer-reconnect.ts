import type { HausDatabase } from '../postgres/connection.ts';
import { listReminderScriptCommands } from '../reminders/reminder-script-delivery.ts';
import { sendReminderScript } from '../reminders/reminder-script-placement.ts';
import type { DeliveryTransport } from './delivery.ts';
import { listComputerAgents, reconcileConfigureFrame } from './dispatch-config.ts';
import { readDeliveryState } from './store.ts';

export async function reconcileComputerAgents(
    deps: {
        db: HausDatabase;
        dispatchAgent: (agentId: string, serverId: string) => Promise<void>;
        transport: DeliveryTransport;
    },
    computerId: string
) {
    const { db, transport } = deps;
    for (const command of await listReminderScriptCommands(db, computerId)) {
        await sendReminderScript(db, transport, computerId, command);
    }
    for (const agent of await listComputerAgents(db, computerId)) {
        if (agent.retiredAt) {
            transport.send(computerId, { agentId: agent.agentId, type: 'agent-retire' });
            continue;
        }
        const state = await readDeliveryState(db, agent.agentId);
        const activeConfigurationChanged =
            Boolean(state?.activeRunId) &&
            (state?.activeRunModelId !== agent.desiredModelId ||
                state?.activeRunRuntimeId !== agent.desiredRuntimeId ||
                state?.activeRunReasoningEffort !== agent.desiredReasoningEffort);
        const { desiredModelId, desiredRuntimeId } = agent;
        if (!activeConfigurationChanged && desiredModelId && desiredRuntimeId) {
            transport.send(
                computerId,
                reconcileConfigureFrame({ ...agent, desiredModelId, desiredRuntimeId })
            );
        }
        await deps.dispatchAgent(agent.agentId, agent.serverId);
    }
}
