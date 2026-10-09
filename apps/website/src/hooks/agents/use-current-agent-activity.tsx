import type { AgentActivityEvent } from '@haus/api';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useAgents } from '../members/use-agents.ts';
import { invalidateServerAgentHistory, patchAgentActivityHistory } from './agent-history-cache.ts';
import {
    type CurrentAgentActivity,
    type CurrentAgentActivityLiveOverlay,
    filterCurrentAgentActivityByAvailability,
    mergeCurrentAgentActivityLiveEvent,
    reconcileCurrentAgentActivity,
} from './current-agent-activity.ts';

export type AgentActivityListener = (event: AgentActivityEvent) => void;

export interface CurrentAgentActivityContextValue {
    activities: readonly CurrentAgentActivity[];
    isSnapshotReady: boolean;
    serverId: string | undefined;
}

/** Hands each committed live event to transient presentation; never replays. */
type SubscribeToActivity = (listener: AgentActivityListener) => () => void;

const CurrentAgentActivityContext = React.createContext<CurrentAgentActivityContextValue | null>(
    null
);
// Separate from the activity snapshot, which changes on every live event: a
// listener in every kept chat view must not re-render when it does.
const AgentActivitySubscriptionContext = React.createContext<SubscribeToActivity | null>(null);

/**
 * Owns the one Server current-activity read and committed activity listener
 * for a persistent Server shell. Live events patch only this volatile cache;
 * the provider below writes each event into cached Activity History pages.
 * Each stream start refreshes current activity and, because the stream never
 * replays, the Server's mounted Activity History, turn, and usage reads.
 */
export function useCurrentAgentActivity(
    serverId: string | undefined,
    onEvent?: AgentActivityListener
) {
    const utils = hausTrpc.useUtils();
    const queryClient = useQueryClient();
    const [liveState, setLiveState] = React.useState<{
        byAgentId: ReadonlyMap<string, CurrentAgentActivityLiveOverlay>;
        serverId: string | undefined;
    }>({ byAgentId: new Map(), serverId });
    const query = hausTrpc.agent.activeActivity.useQuery(
        { serverId: serverId ?? '' },
        {
            ...queryPolicy.volatileState,
            enabled: serverId !== undefined,
        }
    );

    hausTrpc.agent.onActivity.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined,
            onData: (event) => {
                if (event.serverId !== serverId) {
                    return;
                }
                onEvent?.(event);
                setLiveState((current) => {
                    const currentEvents =
                        current.serverId === event.serverId ? current.byAgentId : new Map();
                    const previous = currentEvents.get(event.agentId);
                    const merged = mergeCurrentAgentActivityLiveEvent(previous, event);
                    if (merged === previous) {
                        return current;
                    }
                    const next = new Map(currentEvents);
                    next.set(event.agentId, merged);
                    return { byAgentId: next, serverId: event.serverId };
                });
            },
            onStarted: () => {
                setLiveState({ byAgentId: new Map(), serverId });
                if (serverId) {
                    void utils.agent.activeActivity.invalidate({ serverId });
                    void invalidateServerAgentHistory(queryClient, serverId);
                }
            },
        }
    );

    const activities = React.useMemo(
        () =>
            reconcileCurrentAgentActivity(
                query.data?.activities ?? [],
                liveState.serverId === serverId ? [...liveState.byAgentId.values()] : []
            ),
        [liveState, query.data?.activities, serverId]
    );
    return { ...query, data: query.data ? { activities } : query.data };
}

/**
 * The Server shell's one `agent.onActivity` stream: current activity, transient
 * listeners, and the cached Activity History pages each event extends.
 */
export function AgentActivityProvider({
    children,
    serverId,
}: {
    children: React.ReactNode;
    serverId: string;
}) {
    const [listeners] = React.useState(() => new Set<AgentActivityListener>());
    const subscribeToActivity = React.useCallback(
        (listener: AgentActivityListener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        [listeners]
    );
    const queryClient = useQueryClient();
    const query = useCurrentAgentActivity(serverId, (event) => {
        patchAgentActivityHistory(queryClient, event);
        for (const listener of listeners) {
            listener(event);
        }
    });
    const agents = useAgents(serverId);
    const activities = React.useMemo(
        () =>
            filterCurrentAgentActivityByAvailability(
                query.data?.activities ?? [],
                agents.data ?? []
            ),
        [agents.data, query.data?.activities]
    );
    const value = React.useMemo<CurrentAgentActivityContextValue>(
        () => ({
            activities,
            isSnapshotReady: query.isSuccess && agents.isSuccess,
            serverId,
        }),
        [activities, agents.isSuccess, query.isSuccess, serverId]
    );

    let workState: ServerWorkState = 'unsettled';
    if (value.isSnapshotReady) {
        workState = activities.length > 0 ? 'working' : 'quiet';
    }

    return (
        <AgentActivitySubscriptionContext value={subscribeToActivity}>
            <ServerWorkStateContext value={workState}>
                <CurrentAgentActivityContext value={value}>{children}</CurrentAgentActivityContext>
            </ServerWorkStateContext>
        </AgentActivitySubscriptionContext>
    );
}

/**
 * Whether anyone works on this Server right now, for chrome that shows only
 * that fact (the Haus mark's drift). The activity snapshot changes on every
 * live event; this changes only when the fact does. Null outside a provider.
 */
export function useOptionalServerWorkState(): ServerWorkState | null {
    return React.use(ServerWorkStateContext);
}

export type ServerWorkState = 'quiet' | 'unsettled' | 'working';

const ServerWorkStateContext = React.createContext<ServerWorkState | null>(null);

/** Optional so shared identity components remain renderable in local previews. */
export function useOptionalCurrentAgentActivity() {
    return React.use(CurrentAgentActivityContext);
}

/**
 * Listens to the provider's one `agent.onActivity` stream for transient
 * effects. Outside a provider it hears nothing. The latest listener is always
 * called, so callers need not memoize it.
 */
export function useAgentActivityListener(listener: AgentActivityListener) {
    const subscribe = React.use(AgentActivitySubscriptionContext);
    const latest = React.useRef(listener);
    React.useLayoutEffect(() => {
        latest.current = listener;
    });
    React.useEffect(() => subscribe?.((event) => latest.current(event)), [subscribe]);
}
