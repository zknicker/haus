import { configureFrame, isConfigured } from '../agent-delivery/deferred-configuration.ts';
import type { DeliveryTransport } from '../agent-delivery/delivery.ts';
import { readAgentDispatchConfig } from '../agent-delivery/dispatch-config.ts';
import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentUpdatedTopic, computerUpdatedTopic } from '../realtime/topics.ts';
import { listReminderScriptCommands } from '../reminders/reminder-script-delivery.ts';
import type { MachineChangeStep } from './advance-machine-change.ts';

export interface MachineFences {
    fenceAgent(target: { agentId: string; computerId: string; serverId: string }): unknown;
}

export const unfencedMachines: MachineFences = { fenceAgent: () => 0 };

export async function commitMachineChangeStep(
    step: MachineChangeStep,
    deps: {
        db: HausDatabase;
        dispatchAgent: (agentId: string, serverId: string) => Promise<void>;
        fences: MachineFences;
        transport: DeliveryTransport;
    }
) {
    if (step.kind === 'idle' || step.kind === 'waiting') {
        return;
    }
    const scope = { agentId: step.agentId, serverId: step.serverId };
    agentUpdatedTopic.announce(scope);
    if (step.kind === 'flush') {
        deps.transport.send(step.computerId, step.frame);
        return;
    }
    if (step.kind === 'dropped') {
        await deps.dispatchAgent(step.agentId, step.serverId);
        return;
    }
    if (!(await isAgentAllowedOn(deps.db, { ...scope, computerId: step.from }))) {
        deps.fences.fenceAgent({ ...scope, computerId: step.from });
    }
    const config = await readAgentDispatchConfig(deps.db, step.agentId);
    if (isConfigured(config)) {
        deps.transport.send(step.to, configureFrame(step.agentId, config));
    }
    for (const command of await listReminderScriptCommands(deps.db, step.to)) {
        if (command.agentId === step.agentId) {
            deps.transport.send(step.to, command);
        }
    }
    for (const computerId of [step.from, step.to]) {
        computerUpdatedTopic.announce({ computerId, serverId: step.serverId });
    }
    await deps.dispatchAgent(step.agentId, step.serverId);
}
