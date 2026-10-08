import type { Agent } from '@haus/api';
import * as React from 'react';
import { useTabPresence } from '../../../hooks/desktop-tabs/tab-presence.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import {
    type WorkspaceBarPlacement,
    WorkspaceOpenFileCrumb,
    WorkspacePageToolbar,
    WorkspaceRootCrumb,
} from '../../chats/chat-artifact-workspace-toolbar.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import { AgentActions, AgentActionsSections } from './agent-actions-menu.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';
import { AgentHub } from './agent-hub.tsx';
import { AgentLoading } from './agent-loading.tsx';
import { AgentHubBand, AgentSectionBand, AgentTrail } from './agent-profile-band.tsx';
import { loadAgentProfileContent, useLoadedAgentProfileContent } from './agent-profile-module.ts';
import type { AgentSection } from './agent-sections.ts';

// Cold fallbacks only: a warmed content module renders directly (`useLoadedAgentProfileContent`).
const LazyAgentWorkspace = React.lazy(async () => ({
    default: (await loadAgentProfileContent()).AgentWorkspace,
}));
const LazyAgentSectionBody = React.lazy(async () => ({
    default: (await loadAgentProfileContent()).AgentSectionBody,
}));

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
 * tab both render it. Its trail and controls portal into the page's shell
 * band (`PageTopbar`), as every routed destination's do; the hub's trail is
 * its title, which a desktop tab already shows, so there the band collapses.
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
        return (
            <AgentWorkspacePage
                agent={agent}
                onDeleted={onDeleted}
                onHome={() => onSectionChange('home')}
                server={server}
            />
        );
    }

    return (
        <div
            className="@container h-full min-h-0 w-full overflow-y-auto [scrollbar-gutter:stable]"
            key={section}
        >
            {section === 'home' ? (
                <>
                    <AgentHubBand agent={agent} serverSlug={server.slug} />
                    <PageColumn>
                        <AgentHub
                            agent={agent}
                            onDeleted={onDeleted}
                            onSectionChange={onSectionChange}
                            server={server}
                        />
                    </PageColumn>
                </>
            ) : (
                <>
                    <AgentSectionBand
                        agent={agent}
                        label={sectionLabels[section]}
                        onDeleted={onDeleted}
                        onHome={() => onSectionChange('home')}
                        server={server}
                    />
                    <SectionColumn section={section}>
                        <AgentSectionContent agent={agent} section={section} server={server} />
                    </SectionColumn>
                </>
            )}
        </div>
    );
}

/**
 * A drill-down section's body, rendered in the profile's own commit when the
 * content module is warm, so opening a section never flashes a fallback.
 */
function AgentSectionContent({
    agent,
    section,
    server,
}: {
    agent: Agent;
    section: Exclude<AgentSection, 'home' | 'workspace'>;
    server: ServerDetail;
}) {
    const loaded = useLoadedAgentProfileContent();
    return loaded ? (
        <loaded.AgentSectionBody agent={agent} section={section} server={server} />
    ) : (
        <React.Suspense fallback={<AgentLoading label="Loading Agent section" />}>
            <LazyAgentSectionBody agent={agent} section={section} server={server} />
        </React.Suspense>
    );
}

/**
 * Sections are document columns, except Activity: its log is a full-bleed
 * list whose rows run edge to edge under a band pinned to this scroll region.
 */
function SectionColumn({
    children,
    section,
}: {
    children: React.ReactNode;
    section: Exclude<AgentSection, 'home' | 'workspace'>;
}) {
    return section === 'activity' ? (
        <div className="min-w-0 pb-16">{children}</div>
    ) : (
        <PageColumn>{children}</PageColumn>
    );
}

/**
 * The Workspace is a full-height tool surface with its own rail and scroll, so
 * it takes the whole column. Its one bar holds the trail (ending in the open
 * file), the file's controls, and one "…" menu that also holds the Agent's
 * lifecycle verbs, rather than a trail stacked over a toolbar. On the web the
 * bar rides in the shell band. In a desktop tab it sits over the content
 * column only, so the file rail runs the tab's full height and the band,
 * left empty, collapses.
 */
function AgentWorkspacePage({
    agent,
    onDeleted,
    onHome,
    server,
}: {
    agent: Agent;
    onDeleted: () => void;
    onHome: () => void;
    server: ServerDetail;
}) {
    const canAct = canRunAgentActions(server.role);
    const barPlacement: Extract<WorkspaceBarPlacement, 'band' | 'column'> =
        useTabPresence().tabId === null ? 'band' : 'column';
    const menuSections = canAct ? <AgentActionsSections /> : undefined;
    const loaded = useLoadedAgentProfileContent();
    const trail = (
        <AgentTrail agent={agent} onHome={onHome} serverSlug={server.slug}>
            <WorkspaceRootCrumb>{sectionLabels.workspace}</WorkspaceRootCrumb>
            <WorkspaceOpenFileCrumb />
        </AgentTrail>
    );
    const workspace = {
        agent,
        barPlacement,
        menuSections,
        server,
        toolbarLeading: trail,
    };
    const page = (
        <div className="@container flex h-full min-h-0 w-full flex-col overflow-hidden">
            {loaded ? (
                <loaded.AgentWorkspace {...workspace} />
            ) : (
                <React.Suspense
                    fallback={
                        <>
                            <WorkspacePageToolbar
                                leading={trail}
                                menuSections={menuSections}
                                placement={barPlacement}
                                selectedPath={null}
                                title={null}
                            />
                            <AgentLoading label="Loading workspace" />
                        </>
                    }
                >
                    <LazyAgentWorkspace {...workspace} />
                </React.Suspense>
            )}
        </div>
    );
    return canAct ? (
        <AgentActions agent={agent} onDeleted={onDeleted} server={server}>
            {page}
        </AgentActions>
    ) : (
        page
    );
}
