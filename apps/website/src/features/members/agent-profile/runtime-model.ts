import {
    type Agent,
    type AgentReasoningEffort,
    type ComputerInventory,
    modelReasoningEfforts,
} from '@haus/api';

type Runtime = ComputerInventory['runtimes'][number];

export interface RuntimeConfigDraft {
    modelId: string;
    reasoningEffort: AgentReasoningEffort;
    runtimeId: string;
}

export function resolveRuntimeConfig(
    agent: Pick<Agent, 'desiredModelId' | 'desiredRuntimeId'>,
    runtimes: Runtime[]
) {
    const runtime = runtimes.find((candidate) => candidate.id === agent.desiredRuntimeId) ?? null;
    const model =
        runtime?.models.find((candidate) => candidate.id === agent.desiredModelId) ?? null;

    return {
        model,
        modelLabel: model?.label ?? agent.desiredModelId,
        runtime,
        runtimeLabel: runtime?.label ?? agent.desiredRuntimeId,
    };
}

export function runtimeConfigStatusLabel(
    agent: Pick<Agent, 'status'>,
    computerHealth: 'degraded' | 'healthy' | 'offline' | 'update-required' | undefined
) {
    if (agent.status === 'applied') {
        return 'Current';
    }
    if (agent.status === 'degraded') {
        return 'Needs attention';
    }
    if (computerHealth === 'offline') {
        return 'Applies when Computer reconnects';
    }
    if (computerHealth === 'update-required') {
        return 'Waiting for Computer update';
    }
    return 'Applying';
}

export function isRuntimeConfigDraftAvailable(draft: RuntimeConfigDraft, runtimes: Runtime[]) {
    return Boolean(
        runtimes
            .find((runtime) => runtime.id === draft.runtimeId)
            ?.models.some(
                (model) =>
                    model.id === draft.modelId &&
                    modelReasoningEfforts(model).includes(draft.reasoningEffort)
            )
    );
}
