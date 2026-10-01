const runtimeLabels: Record<string, string> = {
    'claude-code': 'Claude Code',
    codex: 'Codex',
    'grok-build': 'Grok',
    pi: 'Pi',
};

/**
 * The categorical chart slots in their fixed order (see `--chart-*` in
 * artifact-tokens.css). The ramp is never cycled: a fifth Agent folds into the
 * neutral Other series instead of repeating a hue.
 */
export const agentSeriesColors = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
] as const;

export const otherSeriesColor = 'var(--chart-5)';

export function runtimeUsageLabel(runtimeId: string) {
    return runtimeLabels[runtimeId] ?? runtimeId;
}

/**
 * Stable Agent colors. The key is the Agent's position in the roster: the
 * Server's Agent list (oldest first), then any Agent seen only in usage rows,
 * by id. The first four roster Agents own slots 1-4 outright, so with four or
 * fewer Agents a color never depends on the range or the scope. Past four, a
 * named Agent without a home slot takes the lowest slot no other named Agent
 * holds, in roster order; volume decides which Agents are named, never which
 * slot a home-slot Agent gets.
 */
export function agentSeriesColorMap(
    rosterAgentIds: readonly string[],
    namedAgentIds: readonly string[]
): Map<string, string> {
    const slots = agentSeriesColors.length;
    const named = new Set(namedAgentIds);
    const colors = new Map<string, string>();
    const homeless: string[] = [];
    for (const [index, agentId] of rosterAgentIds.entries()) {
        if (!named.has(agentId)) {
            continue;
        }
        if (index < slots) {
            colors.set(agentId, agentSeriesColors[index] as string);
        } else {
            homeless.push(agentId);
        }
    }
    const free = agentSeriesColors.filter((_, index) => {
        const owner = rosterAgentIds[index];
        return !(owner && named.has(owner));
    });
    for (const [index, agentId] of homeless.entries()) {
        const color = free[index];
        if (color) {
            colors.set(agentId, color);
        }
    }
    return colors;
}
