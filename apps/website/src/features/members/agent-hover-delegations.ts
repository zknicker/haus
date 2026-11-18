import type { Agent, AgentActiveDelegation } from '@haus/api';
import { availabilityLabel } from '../computers/presentation.ts';
import { formatElapsedSince, type HoverTimedLine } from './agent-hover-activity-model.ts';

/**
 * The hover card's availability clause, plus the background sub-agents the Agent left running
 * past its turn: `Online · 2 sub-agents running`. The Agent itself stays reachable meanwhile,
 * so the availability is still its own.
 */
export function agentHoverMeta(
    agent: Pick<Agent, 'availability' | 'backgroundSubagents' | 'wakePause'>
): string {
    const label = availabilityLabel(agent);
    const count = agent.backgroundSubagents;
    if (count === 0) {
        return label;
    }
    return `${label} · ${count === 1 ? '1 sub-agent' : `${count} sub-agents`} running`;
}

/**
 * The hover card's one line about running sub-agents: how many, and how long
 * since the first of them started, on the same clock as the live line. Null
 * when none are running.
 */
export function formatAgentDelegationSummary(
    delegations: readonly AgentActiveDelegation[] | undefined,
    now: number
): HoverTimedLine | null {
    if (!delegations || delegations.length === 0) {
        return null;
    }
    const earliest = Math.min(...delegations.map((delegation) => Date.parse(delegation.startedAt)));
    return {
        elapsed: formatElapsedSince(earliest, now),
        label:
            delegations.length === 1
                ? '1 sub-agent running'
                : `${delegations.length} sub-agents running`,
    };
}
