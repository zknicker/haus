import type { Agent, AgentAvailability } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One Agent's current availability from the Server's Agent list. A reader
 * re-renders only when that value changes, not on every list update.
 */
export function useAgentAvailability(serverId: string, agentId: string): AgentAvailability {
    const query = hausTrpc.agent.list.useQuery(
        { serverId },
        {
            ...queryPolicy.syncedSnapshot,
            select: (agents) => agents.find((agent) => agent.id === agentId)?.availability,
        }
    );
    return query.data ?? 'offline';
}

export function useAgents(serverId: string | undefined) {
    return hausTrpc.agent.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined }
    );
}

/**
 * The Server's Agents for surfaces that render only who they are: id, handle,
 * name, avatar. Availability flips on every Agent turn, and a reader of the
 * whole list re-renders with it, in every kept chat view. This list keeps its
 * identity until one of those fields changes, so its objects carry a stale
 * `availability`: read that per Agent (`useAgentAvailability`).
 */
export function useAgentAppearances(serverId: string | undefined): readonly Agent[] {
    const [select] = React.useState(createAppearanceSelector);
    const query = hausTrpc.agent.list.useQuery(
        { serverId: serverId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== undefined, select }
    );
    return query.data ?? noAgents;
}

const noAgents: readonly Agent[] = [];

function createAppearanceSelector() {
    let previous: { agents: Agent[]; key: string } | null = null;
    return (agents: Agent[]): Agent[] => {
        const key = agents
            .map(
                (agent) =>
                    `${agent.id}:${agent.handle}:${agent.displayName}:${agent.avatarUrl ?? ''}`
            )
            .join('|');
        if (previous?.key !== key) {
            previous = { agents, key };
        }
        return previous.agents;
    };
}
