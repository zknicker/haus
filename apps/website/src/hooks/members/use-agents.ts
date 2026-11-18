import type { Agent, AgentAvailability } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One Agent's presence (availability, and whether its wakes are paused) from
 * the Server's Agent list. Availability flips on every turn; a reader
 * re-renders only when this Agent's presence changes, not on every list
 * update. Presence badges read it in their own leaf, so a flip repaints the
 * dot and not the avatar around it.
 */
export function useAgentPresence(serverId: string, agentId: string): AgentPresence {
    const select = React.useCallback(
        (agents: Agent[]): AgentPresence | undefined => {
            const agent = agents.find((entry) => entry.id === agentId);
            return agent
                ? { availability: agent.availability, paused: Boolean(agent.wakePause) }
                : undefined;
        },
        [agentId]
    );
    const query = hausTrpc.agent.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select }
    );
    return query.data ?? offline;
}

export interface AgentPresence {
    availability: AgentAvailability;
    paused: boolean;
}

/** The Server's Agent ids in list order; keeps its identity until one joins, leaves, or moves. */
export function useAgentIds(serverId: string): readonly string[] {
    const query = hausTrpc.agent.list.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select: selectAgentIds }
    );
    return query.data ?? noIds;
}

/** What an Agent's mark shows: who it is, never its runtime state, which churns. */
export interface AgentMark {
    avatarUrl: Agent['avatarUrl'];
    displayName: Agent['displayName'];
    id: Agent['id'];
}

export function useAgentMark(serverId: string, agentId: string): AgentMark | undefined {
    const select = React.useCallback(
        (agents: Agent[]): AgentMark | undefined => {
            const agent = agents.find((entry) => entry.id === agentId);
            return agent
                ? { avatarUrl: agent.avatarUrl, displayName: agent.displayName, id: agent.id }
                : undefined;
        },
        [agentId]
    );
    return hausTrpc.agent.list.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, select })
        .data;
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
 * `availability`: read that per Agent (`useAgentPresence`).
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
const noIds: readonly string[] = [];
const offline: AgentPresence = { availability: 'offline', paused: false };

// A selected result is shared structurally: equal id lists keep the previous array.
function selectAgentIds(agents: Agent[]): string[] {
    return agents.map((agent) => agent.id);
}

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
