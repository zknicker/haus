import type { AgentActiveDelegation } from '@haus/api';

/**
 * The hover card's one line about running sub-agents: how many, and how long
 * since the first of them started. Null when none are running.
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
    return Number.isNaN(earliest) ? count : `${count} · ${formatElapsed(now - earliest)}`;
}

function formatElapsed(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
