import type { Agent, AgentLifecycleEvent } from '@haus/api';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { recoverAgentMessage } from './agent-message-recovery.ts';

export type AgentLifecycles = ReadonlyMap<string, AgentLifecycleEvent>;

const emptyLifecycles: AgentLifecycles = new Map();

export function useAgentLifecycleEvents(serverId: string | undefined): AgentLifecycles {
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();
    const [state, setState] = React.useState<{
        events: Map<string, AgentLifecycleEvent>;
        serverId: string | undefined;
    }>({ events: new Map(), serverId });

    hausTrpc.agent.onLifecycle.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined,
            onData: (event) => {
                if (event.serverId !== serverId) {
                    return;
                }
                setState((current) => {
                    const events =
                        current.serverId === serverId
                            ? new Map(current.events)
                            : new Map<string, AgentLifecycleEvent>();
                    events.set(event.agentId, event);
                    return { events, serverId };
                });
                void recoverAgentMessage(event, utils, queryClient);
                utils.agent.list.setData({ serverId: event.serverId }, (agents) =>
                    agents ? projectAgentAvailability(agents, event) : agents
                );
                utils.agent.get.setData(
                    { agentId: event.agentId, serverId: event.serverId },
                    (agent) => (agent ? projectAgentAvailability([agent], event)[0] : agent)
                );
                if (event.phase === 'settled') {
                    void Promise.all([
                        utils.agent.activity.invalidate({
                            agentId: event.agentId,
                            limit: 50,
                            serverId: event.serverId,
                        }),
                        utils.agent.deliveryState.invalidate({
                            agentId: event.agentId,
                            serverId: event.serverId,
                        }),
                        utils.agent.get.invalidate({
                            agentId: event.agentId,
                            serverId: event.serverId,
                        }),
                        utils.agent.list.invalidate({ serverId: event.serverId }),
                        utils.stats.live.invalidate({ serverId: event.serverId }),
                    ]);
                }
            },
            onStarted: () => {
                if (serverId) {
                    void Promise.all([
                        utils.agent.get.invalidate(undefined, { exact: false }),
                        utils.agent.list.invalidate({ serverId }),
                    ]);
                }
            },
        }
    );

    return state.serverId === serverId ? state.events : emptyLifecycles;
}

export function projectAgentAvailability(
    agents: readonly Agent[],
    event: AgentLifecycleEvent
): Agent[] {
    return agents.map((agent) => {
        if (agent.id !== event.agentId) {
            return agent;
        }
        const availability =
            event.phase !== 'settled'
                ? ('working' as const)
                : event.outcome === 'failed'
                  ? ('error' as const)
                  : event.outcome === 'stopped'
                    ? ('stopped' as const)
                    : ('idle' as const);
        return { ...agent, availability };
    });
}
