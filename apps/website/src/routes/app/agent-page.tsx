import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
    agentPanelKey,
    captainViewForSection,
} from '../../features/agent-panel/agent-panel-model.ts';
import { showAgentPanel } from '../../features/agent-panel/agent-panel-store.ts';
import { captainChatRoute } from '../../features/agent-panel/captain-chat-route.ts';
import { useServerContext } from '../../features/servers/server-context.ts';

/**
 * The retired Captain profile address (`agents/:agentId/:section`). The Captain panel replaced
 * the page (specs/agent-panel.md), so the address opens the Captain's chat with the panel on
 * the section's drill-in, Overview for `home` and anything unknown. The panel view is set
 * before the redirect's own navigation runs.
 */
export function AgentProfileRoute() {
    const { agentId = '', section } = useParams();
    const { server } = useServerContext();
    const { role } = server;
    React.useLayoutEffect(() => {
        showAgentPanel(
            agentPanelKey({ agentId, kind: 'captain' }),
            captainViewForSection(section, role)
        );
    }, [agentId, role, section]);
    return <Navigate replace to={captainChatRoute(server.slug, agentId)} />;
}
