import type { Agent, ComputerInventory } from '@haus/api';
import { computerRuntimeCatalog } from '@haus/api';

export function agentRuntimeIssue(
    agent: Pick<Agent, 'desiredRuntimeId' | 'effectiveRuntimeId'>,
    inventory: ComputerInventory | null
) {
    const runtimeId = agent.effectiveRuntimeId ?? agent.desiredRuntimeId;
    return inventory?.runtimeIssues?.find((issue) => issue.runtimeId === runtimeId) ?? null;
}

export function runtimeIssueLabel(runtimeId: string) {
    const label = computerRuntimeCatalog.find(({ id }) => id === runtimeId)?.label ?? runtimeId;
    return `${label} sign-in required`;
}

export function runtimeLoginCommand(runtimeId: string): string | null {
    switch (runtimeId) {
        case 'grok-build':
            return 'grok login';
        case 'codex':
            return 'codex login';
        case 'claude-code':
            return 'claude auth login';
        default:
            return null;
    }
}
