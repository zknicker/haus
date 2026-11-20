import {
    type AgentReasoningEffort,
    type ComputerInventory,
    type ComputerRuntime,
    modelDefaultReasoningEffort,
    modelProviderFor,
    modelReasoningEfforts,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';
import { assertRuntimeModelReported } from './agent-inventory.ts';

export interface ModelChoice {
    modelId: string;
    reasoningEffort?: AgentReasoningEffort;
    runtimeId: string;
    serverId: string;
}

export type AgentModelCatalog =
    | { kind: 'computer' }
    | { kind: 'runner'; runtimes: () => readonly ComputerRuntime[] | null };

export const computerModelCatalog: AgentModelCatalog = { kind: 'computer' };

export async function assertModelAvailable(
    db: Pick<HausDatabase, 'select'>,
    catalog: AgentModelCatalog,
    computerInventory: ComputerInventory | null,
    choice: ModelChoice
) {
    if (catalog.kind === 'computer') {
        assertRuntimeModelReported(
            computerInventory,
            choice.runtimeId,
            choice.modelId,
            choice.reasoningEffort
        );
        return;
    }
    const runtimes = catalog.runtimes();
    if (!runtimes) {
        throw new AgentConfigDeniedError(
            'The Agent runner has not reported its models yet. Try again once it connects.'
        );
    }
    const model = runtimes
        .find((runtime) => runtime.id === choice.runtimeId)
        ?.models.find((candidate) => candidate.id === choice.modelId);
    if (!model) {
        throw new AgentConfigDeniedError(
            `Haus does not offer the model "${choice.modelId}" in "${choice.runtimeId}".`
        );
    }
    if (choice.reasoningEffort && !modelReasoningEfforts(model).includes(choice.reasoningEffort)) {
        throw new AgentConfigDeniedError(
            `The model "${choice.modelId}" does not support reasoning effort "${choice.reasoningEffort}".`
        );
    }
}

export function inheritedModel<Execution extends Omit<ModelChoice, 'serverId'>>(
    catalog: AgentModelCatalog,
    execution: Execution
) {
    if (catalog.kind === 'computer') {
        return execution;
    }
    const runtimes = catalog.runtimes() ?? [];
    const offered = runtimes.some(
        (runtime) =>
            runtime.id === execution.runtimeId &&
            runtime.models.some((model) => model.id === execution.modelId)
    );
    if (offered) {
        return execution;
    }
    const provider = modelProviderFor(execution.modelId);
    for (const runtime of runtimes) {
        const successor = runtime.models.find((model) => modelProviderFor(model.id) === provider);
        if (successor) {
            const efforts = modelReasoningEfforts(successor);
            const mapped: Execution = {
                ...execution,
                modelId: successor.id,
                reasoningEffort:
                    execution.reasoningEffort && efforts.includes(execution.reasoningEffort)
                        ? execution.reasoningEffort
                        : modelDefaultReasoningEffort(successor),
                runtimeId: runtime.id,
            };
            return mapped;
        }
    }
    return execution;
}
