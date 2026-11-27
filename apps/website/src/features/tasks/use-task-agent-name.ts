import * as React from 'react';
import { useModelLabels } from './use-task-facts.ts';

export function useTaskAgentName(
    serverId: string,
    agent: { id: string; model: string | null } | null
) {
    const models = useModelLabels(serverId);
    const id = agent?.id ?? null;
    const name = agent?.model ? (models.get(agent.model) ?? agent.model) : null;
    return React.useMemo(() => (id && name ? new Map([[id, name]]) : undefined), [id, name]);
}
