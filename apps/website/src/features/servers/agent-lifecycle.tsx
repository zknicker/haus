import * as React from 'react';
import {
    type AgentLifecycles,
    useAgentLifecycleEvents,
} from '../../hooks/servers/use-agent-lifecycle.ts';

const AgentLifecycleContext = React.createContext<AgentLifecycles | null>(null);

export function AgentLifecycleProvider({
    children,
    serverId,
}: {
    children: React.ReactNode;
    serverId: string;
}) {
    const events = useAgentLifecycleEvents(serverId);

    return (
        <AgentLifecycleContext.Provider value={events}>{children}</AgentLifecycleContext.Provider>
    );
}

export function useAgentLifecycle() {
    const events = React.useContext(AgentLifecycleContext);
    if (!events) {
        throw new Error('useAgentLifecycle must be used within AgentLifecycleProvider.');
    }
    return events;
}
