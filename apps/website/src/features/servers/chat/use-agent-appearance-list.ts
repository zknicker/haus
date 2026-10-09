import type { Agent } from '@haus/api';
import * as React from 'react';

/**
 * The Server's Agents as transcript rows read them. Keeps one list identity
 * until a rendered field (handle, name, avatar) changes: availability flips on
 * every Agent turn, and a new list would rebuild the row context and re-render
 * every row of every kept transcript. Avatars read availability themselves
 * (`useAgentAvailability`).
 */
export function useAgentAppearanceList(agents: readonly Agent[]): readonly Agent[] {
    const key = agents
        .map((agent) => `${agent.id}:${agent.handle}:${agent.displayName}:${agent.avatarUrl ?? ''}`)
        .join('|');
    // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the fields rows read.
    return React.useMemo(() => agents, [key]);
}
