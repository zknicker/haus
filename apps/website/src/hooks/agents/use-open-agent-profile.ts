import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import { agentProfileRoute } from '../../features/servers/server-routes.ts';
import { useBrowserWorkspace } from '../../features/shell/browser-workspace-context.tsx';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

export interface OpenAgentProfileOptions {
    section?: AgentSection;
}

/**
 * The one way to open an Agent's profile (ADR 0038). Desktop opens or selects
 * the Agent's workspace tab; web navigates to the profile route. It reads only
 * the route's Server slug and the workspace context, so it works anywhere in
 * the Server shell, outlet or not (the sidebar, the command menu).
 */
export function useOpenAgentProfile() {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    const openAgent = useBrowserWorkspace()?.openAgent;
    return useCallback(
        (agentId: string, options: OpenAgentProfileOptions = {}) => {
            if (openAgent && getDesktopBridge()?.browserCommand) {
                openAgent(agentId, { section: options.section });
                return;
            }
            navigate(agentProfileRoute(slug, agentId, options.section));
        },
        [navigate, openAgent, slug]
    );
}
