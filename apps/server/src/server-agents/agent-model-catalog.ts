import {
    type AgentReasoningEffort,
    type ComputerInventory,
    type ComputerRuntime,
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
