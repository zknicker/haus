import { type Agent, modelDefaultReasoningEffort } from '@haus/api';
import type { AgentCreationSubmitValues, ReportedComputer } from './agent-creation-contract.ts';

/**
 * Where a new Agent starts: Cove's own execution configuration when the Server
 * has Cove and the Computer still reports it, and the first reported option
 * otherwise. Cove is the Agent every Server has, so its Computer, runtime, and
 * model are the one setup already known to work here.
 */
export function resolveAgentCreationDefaults(
    reported: readonly ReportedComputer[],
    agents: readonly Agent[]
) {
    const cove = agents.find((agent) => agent.factoryKind === 'cove');
    const computer = reported.find((entry) => entry.id === cove?.computerId) ?? reported[0] ?? null;
    const runtime =
        computer?.inventory.runtimes.find((entry) => entry.id === cove?.desiredRuntimeId) ??
        computer?.inventory.runtimes[0];
    const model =
        runtime?.models.find((entry) => entry.id === cove?.desiredModelId) ?? runtime?.models[0];

    return {
        computerId: computer?.id ?? '',
        modelId: model?.id ?? '',
        reasoningEffort: cove?.desiredReasoningEffort ?? modelDefaultReasoningEffort(model ?? {}),
        runtimeId: runtime?.id ?? '',
    } satisfies Pick<
        AgentCreationSubmitValues,
        'computerId' | 'modelId' | 'reasoningEffort' | 'runtimeId'
    >;
}
