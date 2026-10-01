import type { Agent } from '@haus/api';
import { Breadcrumbs } from '@heroui/react';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import { AgentActionsMenu } from './agent-actions-menu.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';
import { AgentActivity, AgentAutomations, AgentWorkspace } from './agent-content.tsx';
import { AgentHub } from './agent-hub.tsx';
import { AgentProfileCard } from './agent-profile-card.tsx';
import type { AgentSection } from './agent-sections.ts';
import {
    AgentConnectionsSection,
    AgentRuntimeSection,
    AgentSkillsSection,
} from './agent-setup-sections.tsx';

export interface AgentProfileViewProps {
    agent: Agent;
    onDeleted: () => void;
    onSectionChange: (section: AgentSection) => void;
    section: AgentSection;
    server: ServerDetail;
}

const sectionLabels: Record<Exclude<AgentSection, 'home'>, string> = {
    activity: 'Activity',
    automations: 'Automations',
    connections: 'Connections',
    profile: 'Profile',
    runtime: 'Runs on',
    skills: 'Skills',
    workspace: 'Workspace',
};

/**
 * An Agent's profile body, host-agnostic: the web route and the desktop agent
 * tab both render it. It owns its breadcrumb and never portals into the band.
 *
 * It fills a height-bounded parent and scrolls itself, and every width rule is
 * a container query, so it lays out the same in a full window and a 420px
 * split column. The scroll region is keyed by section so a drill-down opens
 * at its top rather than at the hub's scroll offset.
 */
export function AgentProfileView({
    agent,
    onDeleted,
    onSectionChange,
    server,
    section,
}: AgentProfileViewProps) {
    if (section === 'workspace') {
        // The file browser is a full-height tool surface with its own rail and
        // scroll, so it takes the space below the trail instead of a column.
        return (
            <div className="@container flex h-full min-h-0 w-full flex-col">
                <div className="mx-auto w-full max-w-6xl shrink-0 px-6 pt-4 pb-3">
                    <SectionTrail
                        agent={agent}
                        label={sectionLabels.workspace}
                        onDeleted={onDeleted}
                        onHome={() => onSectionChange('home')}
                        server={server}
                    />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <AgentWorkspace agent={agent} server={server} />
                </div>
            </div>
        );
    }

    return (
        <div
            className="@container h-full min-h-0 w-full overflow-y-auto [scrollbar-gutter:stable]"
            key={section}
        >
            {section === 'home' ? (
                <PageColumn>
                    <AgentHub
                        agent={agent}
                        onDeleted={onDeleted}
                        onSectionChange={onSectionChange}
                        server={server}
                    />
                </PageColumn>
            ) : (
                <PageColumn className="pt-4">
                    <SectionTrail
                        agent={agent}
                        label={sectionLabels[section]}
                        onDeleted={onDeleted}
                        onHome={() => onSectionChange('home')}
                        server={server}
                    />
                    <SectionBody agent={agent} section={section} server={server} />
                </PageColumn>
            )}
        </div>
    );
}

/**
 * "Juniper / Connections": the way back to the hub, and where you are. The
 * lifecycle menu rides at its far end so every section reaches it.
 */
function SectionTrail({
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
        <div className="flex min-w-0 items-center justify-between gap-2">
            <Breadcrumbs className="min-w-0">
                <Breadcrumbs.Item onPress={onHome}>{agent.displayName}</Breadcrumbs.Item>
                <Breadcrumbs.Item>{label}</Breadcrumbs.Item>
            </Breadcrumbs>
            {canRunAgentActions(server.role) ? (
                <AgentActionsMenu agent={agent} onDeleted={onDeleted} server={server} />
            ) : null}
        </div>
    );
}

function SectionBody({
    agent,
    section,
    server,
}: {
    agent: Agent;
    section: Exclude<AgentSection, 'home' | 'workspace'>;
    server: ServerDetail;
}) {
    switch (section) {
        case 'runtime':
            return <AgentRuntimeSection agent={agent} server={server} />;
        case 'profile':
            return <AgentProfileCard agent={agent} />;
        case 'automations':
            return <AgentAutomations agent={agent} server={server} />;
        case 'skills':
            return <AgentSkillsSection agent={agent} server={server} />;
        case 'connections':
            return <AgentConnectionsSection agent={agent} server={server} />;
        case 'activity':
            return <AgentActivity agent={agent} server={server} />;
    }
}
