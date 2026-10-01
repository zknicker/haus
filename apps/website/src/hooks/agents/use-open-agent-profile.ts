import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import { agentProfileRoute } from '../../features/servers/server-routes.ts';

export interface OpenAgentProfileOptions {
    section?: AgentSection;
    /** `main` forces the main strip (Cmd-click); `auto` follows the split rule. */
    placement?: 'auto' | 'main';
}

/**
 * The one way to open an Agent's profile (ADR 0038). Desktop opens or selects
 * the Agent's workspace tab; web navigates to the profile route.
 */
export function useOpenAgentProfile() {
    const navigate = useNavigate();
    const { server } = useServerContext();
    // SEAM: the desktop tab branch lands with the split/agent-tab slice.
    return useCallback(
        (agentId: string, options: OpenAgentProfileOptions = {}) => {
            navigate(agentProfileRoute(server.slug, agentId, options.section));
        },
        [navigate, server.slug],
    );
}
