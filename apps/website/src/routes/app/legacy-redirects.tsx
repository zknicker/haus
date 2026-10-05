import { Navigate, useLocation, useParams } from 'react-router-dom';
import { agentProfileRoute, settingsHumanRoute } from '../../features/servers/server-routes.ts';

/** Computers moved into Settings; keep old deep links (and their ?computer=…) working. */
export function LegacyComputersRedirect() {
    const location = useLocation();
    return <Navigate replace to={`../settings/computers${location.search}`} />;
}

/**
 * A human is a record under Settings > Members and an Agent has its own page,
 * so both the retired members browser and the Agent's old settings address
 * keep working — including the Agent's tab, the segment after the id.
 */
export function LegacyMemberRedirect({ kind }: { kind: 'agents' | 'humans' }) {
    const { agentId, userId } = useParams();
    const location = useLocation();
    if (kind === 'humans') {
        return (
            <Navigate replace to={settingsHumanRoute(slugFrom(location.pathname), userId ?? '')} />
        );
    }
    const tab = location.pathname.split(`/agents/${agentId}/`)[1]?.split('/')[0];
    return (
        <Navigate
            replace
            to={agentProfileRoute(slugFrom(location.pathname), agentId ?? '', tab || 'home')}
        />
    );
}

function slugFrom(pathname: string) {
    return pathname.split('/')[2] ?? '';
}

/** An Agent's bare address lands on its Home section. */
export function AgentHomeRedirect() {
    return <Navigate replace to="home" />;
}
