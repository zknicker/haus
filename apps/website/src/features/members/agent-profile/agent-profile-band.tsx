import type { Agent } from '@haus/api';
import type * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { BandBreadcrumbs } from '../../shell/band-breadcrumbs.tsx';
import type { BandCrumb } from '../../shell/band-trail.ts';
import { PageBand } from '../../shell/page-band.tsx';
import { AgentActionsMenu } from './agent-actions-menu.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';

/**
 * The Agent's crumb: its face and name. An Agent is a first-class record with
 * no list page above it, so it stands where a section does: Haus › Juniper.
 * It returns to the hub while a section is open; on the hub it is the current
 * crumb.
 */
function agentCrumb(agent: Agent, onHome?: () => void): BandCrumb {
    return {
        label: agent.displayName,
        mark: <EntityAvatar name={agent.displayName} size={16} src={agent.avatarUrl} />,
        onPress: onHome,
    };
}

/**
 * The Agent Workspace's trail, for a bar the Workspace draws itself:
 * Haus › Juniper › `children` (its root and open-file crumbs).
 */
export function AgentTrail({
    agent,
    children,
    onHome,
}: {
    agent: Agent;
    children: React.ReactNode;
    onHome: () => void;
}) {
    return <BandBreadcrumbs crumbs={[agentCrumb(agent, onHome)]}>{children}</BandBreadcrumbs>;
}

/** The hub's band: Haus › Juniper. */
export function AgentHubBand({ agent }: { agent: Agent }) {
    return (
        <PageBand>
            <PageBand.Trail current={agentCrumb(agent)} />
        </PageBand>
    );
}

/**
 * A drill-down section's band: the trail back to the hub, with the lifecycle
 * menu at its far end so every section reaches it.
 */
export function AgentSectionBand({
    agent,
    label,
    onDeleted,
    onHome,
    server,
}: {
    agent: Agent;
    label: string;
    onDeleted: () => void;
    onHome: () => void;
    server: ServerDetail;
}) {
    return (
        <PageBand>
            <PageBand.Trail crumbs={[agentCrumb(agent, onHome)]} current={label} />
            {canRunAgentActions(server.role) ? (
                <PageBand.Controls>
                    <AgentActionsMenu
                        agent={agent}
                        onDeleted={onDeleted}
                        server={server}
                        variant="ghost"
                    />
                </PageBand.Controls>
            ) : null}
        </PageBand>
    );
}
