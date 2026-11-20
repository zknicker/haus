import { type Agent, modelDefaultReasoningEffort } from '@haus/api';
import type { AgentCreationSubmitValues, ReportedComputer } from './agent-creation-contract.ts';

/**
 * Where a new Agent starts: the Server's first Agent's execution configuration
 * when its Computer still reports it, and the first reported option otherwise.
 * An existing Agent's Computer, runtime, and model are a setup already known to
 * work here.
 */
export function resolveAgentCreationDefaults(
    reported: readonly ReportedComputer[],
    agents: readonly Agent[]
) {
    const [anchor] = agents;
    const computer =
        reported.find((entry) => entry.id === anchor?.computerId) ?? reported[0] ?? null;
    const runtime =
        computer?.inventory.runtimes.find((entry) => entry.id === anchor?.desiredRuntimeId) ??
        computer?.inventory.runtimes[0];
    const model =
        runtime?.models.find((entry) => entry.id === anchor?.desiredModelId) ?? runtime?.models[0];

    return {
        computerId: computer?.id ?? '',
        modelId: model?.id ?? '',
        reasoningEffort: anchor?.desiredReasoningEffort ?? modelDefaultReasoningEffort(model ?? {}),
        runtimeId: runtime?.id ?? '',
    } satisfies Pick<
        AgentCreationSubmitValues,
        'computerId' | 'modelId' | 'reasoningEffort' | 'runtimeId'
    >;
}
