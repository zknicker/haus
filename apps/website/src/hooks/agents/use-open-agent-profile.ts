import { useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AgentSection } from '../../features/members/agent-profile/agent-sections.ts';
import { agentProfileRoute } from '../../features/servers/server-routes.ts';

export interface OpenAgentProfileOptions {
    section?: AgentSection;
}

/**
 * The one way to open an Agent's profile: a push to its page. On desktop the
 * router it runs under places it (ADR 0039): from a page it is Open (the right
 * pane), from the sidebar or command menu Go (the left pane). It reads only the
 * route's Server slug, so it works anywhere in the Server shell. The opener
 * keeps one identity for the caller's lifetime, so a surface can hand it to
 * many rows without re-rendering them when the route changes.
 */
export function useOpenAgentProfile() {
    const navigate = useNavigate();
    const { slug = '' } = useParams();
    return useOpenAgentProfileWith(navigate, slug);
}

/**
 * The same command with a caller-owned navigate and slug, for window chrome that must not
 * re-render on every location change (the sidebar's `useSidebarNavigate`).
 */
export function useOpenAgentProfileWith(navigate: (path: string) => void, slug: string) {
    const route = useRef({ navigate, slug });
    route.current = { navigate, slug };
    return useCallback((agentId: string, options: OpenAgentProfileOptions = {}) => {
        route.current.navigate(agentProfileRoute(route.current.slug, agentId, options.section));
    }, []);
}
