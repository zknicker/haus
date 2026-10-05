import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import { agentProfileRoute } from '../../features/servers/server-routes.ts';

export interface OpenAgentProfileOptions {
    section?: AgentSection;
}

/**
 * The one way to open an Agent's profile: a push to its page. On desktop the
 * router it runs under places it (ADR 0039): from a page it is a link (the
 * other pane in split), from the sidebar or command menu it goes to a place
 * from the focused pane. It reads only the route's Server slug, so it
 * works anywhere in the Server shell.
 */
export function useOpenAgentProfile() {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    return useCallback(
        (agentId: string, options: OpenAgentProfileOptions = {}) => {
            navigate(agentProfileRoute(slug, agentId, options.section));
        },
        [navigate, slug]
    );
}
