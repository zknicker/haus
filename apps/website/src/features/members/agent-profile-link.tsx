import { Link, type LinkProps, useParams } from 'react-router-dom';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { usePreloadAgentProfile } from '../../hooks/members/use-preload-agent-profile.ts';
import { usePressNavigation } from '../../hooks/shell/use-press-navigation.ts';
import { agentProfileRoute } from '../servers/server-routes.ts';
import type { AgentSection } from './agent-profile/agent-sections.ts';

/**
 * A real link to an Agent's profile — middle-click and copy-link keep the
 * route — that warms the profile on hover or focus and opens it on a plain
 * mouse press. Keyboard and other clicks open it through `useOpenAgentProfile`.
 * On desktop, Command-click and middle-click open a new tab (the desktop
 * shell's link handler, ADR 0039).
 */
export function AgentProfileLink({
    agentId,
    onFocus,
    onMouseEnter,
    section,
    ...props
}: Omit<LinkProps, 'onClick' | 'to'> & { agentId: string; section?: AgentSection }) {
    const { slug = '' } = useParams();
    const openAgentProfile = useOpenAgentProfile();
    const preload = usePreloadAgentProfile(agentId);
    const href = agentProfileRoute(slug, agentId, section);
    const pressRef = usePressNavigation(href, preload);

    return (
        <Link
            {...props}
            onClick={(event) => {
                if (event.button !== 0 || event.shiftKey || event.altKey) {
                    return;
                }
                event.preventDefault();
                openAgentProfile(agentId, { section });
            }}
            onFocus={(event) => {
                preload();
                onFocus?.(event);
            }}
            onMouseEnter={(event) => {
                preload();
                onMouseEnter?.(event);
            }}
            ref={pressRef}
            to={href}
        />
    );
}
