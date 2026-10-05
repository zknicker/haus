import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { AgentLoading } from '../../features/members/agent-profile/agent-loading.tsx';
import { AgentProfileView } from '../../features/members/agent-profile/agent-profile-view.tsx';
import { resolveAgentSectionParam } from '../../features/members/agent-profile/agent-section-route.ts';
import { useServerContext } from '../../features/servers/server-context.ts';
import {
    agentProfileRoute,
    serverSettingsSectionRoute,
} from '../../features/servers/server-routes.ts';
import { useAgent } from '../../hooks/members/use-agent.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';

/**
 * An Agent's own page, in the Server layout beside Usage (a tab's page on
 * desktop): the profile hub, or one of its drill-down sections named by the
 * last path segment (ADR 0038). This route only resolves the Agent and maps
 * section changes onto the address, which stays in the tab (same page key).
 *
 * Humans stay records under Settings > Members, and the old settings links
 * redirect here.
 */
export function AgentProfileRoute() {
    const { agentId = '', section: sectionParam } = useParams();
    const navigate = useNavigate();
    const { server } = useServerContext();
    const agent = useAgent(server.id, agentId);
    const agents = useAgents(server.id);
    const record = agent.data ?? agents.data?.find((candidate) => candidate.id === agentId);
    const membersRoute = serverSettingsSectionRoute(server.slug, 'members');
    const section = resolveAgentSectionParam(sectionParam);
    useWindowTitle(record?.displayName);

    if (section.kind === 'redirect') {
        return <Navigate replace to={agentProfileRoute(server.slug, agentId, section.section)} />;
    }
    if (agent.isPending && !record) {
        return (
            <div className="mx-auto w-full max-w-3xl px-6 pt-8">
                <AgentLoading label="Loading Agent" />
            </div>
        );
    }
    if (!record) {
        return <Navigate replace to={membersRoute} />;
    }

    return (
        <AgentProfileView
            agent={record}
            key={record.id}
            onDeleted={() => navigate(membersRoute, { replace: true })}
            onSectionChange={(next) => navigate(agentProfileRoute(server.slug, agentId, next))}
            section={section.section}
            server={server}
        />
    );
}
