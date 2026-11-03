import { Button } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';

/** A URL parameter the reader can drop. */
export type UsageFilterKey = 'agent' | 'computer' | 'runtime';

export interface UsageFilterChip {
    key: UsageFilterKey;
    label: string;
}

export interface UsageFilterInputs {
    /** True while `agent.list` is still settling, so we cannot yet call an id missing. */
    agentsPending: boolean;
    /** The Computer's own label once `computer.list` resolved the requested id. */
    computerLabel: string | undefined;
    computersPending: boolean;
    requestedAgentId: null | string;
    requestedComputerId: null | string;
    /** True once the roster settled and it contains the requested Agent. */
    resolvedAgent: boolean;
    runtimeId: string | undefined;
}

/**
 * The chips above the cards, one per scope the URL asked for. A requested id
 * that no roster contains still gets a chip: dropping it silently paints
 * Server-wide totals under a link that promised one Agent or one Computer.
 *
 * The Agent chip is the exception that only appears when the id is unresolvable
 * — a resolved Agent is already named by the scope picker inside the dashboard,
 * and naming it twice makes one fact read as two filters.
 */
export function usageFilterChips(inputs: UsageFilterInputs): UsageFilterChip[] {
    const chips: UsageFilterChip[] = [];
    if (inputs.requestedComputerId) {
        chips.push({
            key: 'computer',
            label: `Computer: ${inputs.computerLabel ?? (inputs.computersPending ? 'Loading…' : 'Unavailable')}`,
        });
    }
    if (inputs.requestedAgentId && !(inputs.resolvedAgent || inputs.agentsPending)) {
        chips.push({ key: 'agent', label: 'Agent: Unavailable' });
    }
    if (inputs.runtimeId) {
        chips.push({ key: 'runtime', label: `Runtime: ${runtimeLabel(inputs.runtimeId)}` });
    }
    return chips;
}

export function ActiveUsageFilters({
    chips,
    onRemove,
}: {
    chips: readonly UsageFilterChip[];
    onRemove: (key: UsageFilterKey) => void;
}) {
    return (
        <fieldset className="flex flex-wrap items-center gap-2 px-1">
            <legend className="sr-only">Active usage filters</legend>
            {chips.map((chip) => (
                <Button
                    key={chip.key}
                    onPress={() => onRemove(chip.key)}
                    size="sm"
                    variant="secondary"
                >
                    {chip.label}
                    <Icon aria-hidden="true" icon={Cancel01Icon} size={14} />
                </Button>
            ))}
        </fieldset>
    );
}

function runtimeLabel(runtimeId: string) {
    switch (runtimeId) {
        case 'claude-code':
            return 'Claude Code';
        case 'grok-build':
            return 'Grok Build';
        case 'codex':
            return 'Codex';
        default:
            return runtimeId;
    }
}
