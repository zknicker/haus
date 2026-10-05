import { Link, type LinkProps, useParams } from 'react-router-dom';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { agentProfileRoute } from '../servers/server-routes.ts';
import type { AgentSection } from './agent-profile/agent-sections.ts';

/**
 * A real link to an Agent's profile — middle-click and copy-link keep the
 * route — whose primary click opens the profile through `useOpenAgentProfile`.
 * On desktop, Command-click and middle-click open a new tab (the desktop
 * shell's link handler, ADR 0039).
 */
export function AgentProfileLink({
    agentId,
    section,
    ...props
}: Omit<LinkProps, 'onClick' | 'to'> & { agentId: string; section?: AgentSection }) {
    const { slug = '' } = useParams();
    const openAgentProfile = useOpenAgentProfile();

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
            to={agentProfileRoute(slug, agentId, section)}
        />
    );
}
