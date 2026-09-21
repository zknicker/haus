import {
    type AgentReasoningEffort,
    agentReasoningEffortLabels,
    type ComputerInventory,
    modelDefaultReasoningEffort,
    modelReasoningEfforts,
} from '@haus/api';
import { InventorySelect } from './inventory-select.tsx';

type Model = ComputerInventory['runtimes'][number]['models'][number];

export function supportedReasoningEffort(
    model: Model | undefined,
    preferred: AgentReasoningEffort
): AgentReasoningEffort {
    if (!model) {
        return preferred;
    }
    const efforts = modelReasoningEfforts(model);
    return efforts.includes(preferred) ? preferred : modelDefaultReasoningEffort(model);
}

export function ReasoningSelect({
    model,
    value,
    onChange,
}: {
    model: Model | undefined;
    value: AgentReasoningEffort;
    onChange: (value: AgentReasoningEffort) => void;
}) {
    const efforts = model ? modelReasoningEfforts(model) : [];
    return (
        <InventorySelect
            disabled={!model || efforts.length === 1}
            label="Reasoning effort"
            onChange={(next) => {
                const effort = efforts.find((candidate) => candidate === next);
                if (effort) {
                    onChange(effort);
                }
            }}
            options={efforts.map((id) => ({ id, label: agentReasoningEffortLabels[id] }))}
            placeholder="Select reasoning effort"
            value={value}
        />
    );
}
