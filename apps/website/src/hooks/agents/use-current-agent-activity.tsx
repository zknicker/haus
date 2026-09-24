import type { AgentActivityEvent } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useAgents } from '../members/use-agents.ts';
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
    /** Hands each committed live event to transient presentation; never replays. */
    subscribeToActivity: (listener: AgentActivityListener) => () => void;
}

const CurrentAgentActivityContext = React.createContext<CurrentAgentActivityContextValue | null>(
    null
);

/**
 * Owns the one Server current-activity read and committed activity listener
 * for a persistent Server shell. Live events patch only this volatile cache;
 * Activity History remains an independent read and is never invalidated here.
 */
export function useCurrentAgentActivity(
    serverId: string | undefined,
    onEvent?: AgentActivityListener
) {
    const utils = hausTrpc.useUtils();
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
                }
            },
        }
    );

    const activities = React.useMemo(
        () =>
            reconcileCurrentAgentActivity(
                query.data?.activities ?? [],
                liveState.serverId === serverId
                    ? [...liveState.byAgentId.values()].map((overlay) => overlay.event)
                    : []
            ),
        [liveState, query.data?.activities, serverId]
    );
    return { ...query, data: query.data ? { activities } : query.data };
}

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
    const query = useCurrentAgentActivity(serverId, (event) => {
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
            subscribeToActivity,
        }),
        [activities, agents.isSuccess, query.isSuccess, serverId, subscribeToActivity]
    );

    return <CurrentAgentActivityContext value={value}>{children}</CurrentAgentActivityContext>;
}

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
    const subscribe = React.use(CurrentAgentActivityContext)?.subscribeToActivity;
    const latest = React.useRef(listener);
    React.useLayoutEffect(() => {
        latest.current = listener;
    });
    React.useEffect(() => subscribe?.((event) => latest.current(event)), [subscribe]);
}
