import type { AgentActiveDelegation } from '@haus/api';
import { formatElapsedClock } from './agent-hover-activity-model.ts';

/**
 * The hover card's one line about running sub-agents: how many, and how long
 * since the first of them started, on the same clock as the live line. Null
 * when none are running.
 */
export function formatAgentDelegationSummary(
    delegations: readonly AgentActiveDelegation[] | undefined,
    now: number
): string | null {
    if (!delegations || delegations.length === 0) {
        return null;
    }
    const earliest = Math.min(...delegations.map((delegation) => Date.parse(delegation.startedAt)));
    const count =
        delegations.length === 1
            ? '1 sub-agent running'
            : `${delegations.length} sub-agents running`;
    return Number.isNaN(earliest) ? count : `${count} · ${formatElapsedClock(now - earliest)}`;
}
