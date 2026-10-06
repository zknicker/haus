import type { Agent } from '@haus/api';
import { Breadcrumbs } from '@heroui/react';
import type * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { inboxRoute } from '../../servers/server-routes.ts';
import { SectionHeader } from '../../shell/section-header.tsx';
import { PageTopbar } from '../../shell/shell-topbar.tsx';
import { AgentActionsMenu } from './agent-actions-menu.tsx';
import { canRunAgentActions } from './agent-actions-model.ts';

/** Matches the 16px glyph Settings and the Inbox lead their band trails with. */
const trailMarkSize = 16;

/**
 * The Agent profile's band trail, in Settings' band shape: the Agent's face,
 * then Haus › Juniper › section crumbs. The Agent crumb returns to the hub
 * while a section is open; on the hub it is the current crumb.
 */
export function AgentTrail({
    agent,
    children,
    onHome,
    serverSlug,
}: {
    agent: Agent;
    /** Section crumbs after the Agent's; none on the hub. */
    children?: React.ReactNode;
    onHome?: () => void;
    serverSlug: string;
}) {
    return (
        <div className="flex min-w-0 shrink items-center gap-2">
            <EntityAvatar name={agent.displayName} size={trailMarkSize} src={agent.avatarUrl} />
            <Breadcrumbs className="min-w-0">
                <Breadcrumbs.Item href={inboxRoute(serverSlug)}>Haus</Breadcrumbs.Item>
                <Breadcrumbs.Item onPress={onHome}>{agent.displayName}</Breadcrumbs.Item>
                {children}
            </Breadcrumbs>
        </div>
    );
}

/**
 * The hub's band: the trail's root, which titles the page on the web like
 * every other routed destination. It is SectionHeader's `leading`, so inside a
 * desktop tab — which already names the Agent — it drops and the band
 * collapses.
 */
export function AgentHubBand({ agent, serverSlug }: { agent: Agent; serverSlug: string }) {
    return (
        <PageTopbar>
            <SectionHeader leading={<AgentTrail agent={agent} serverSlug={serverSlug} />} />
        </PageTopbar>
    );
}

/**
 * A drill-down section's band: the trail back to the hub, with the lifecycle
 * menu at its far end so every section reaches it. A section's trail is more
 * specific than its tab, so it shows on desktop too.
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
        <PageTopbar>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <AgentTrail agent={agent} onHome={onHome} serverSlug={server.slug}>
                    <Breadcrumbs.Item>{label}</Breadcrumbs.Item>
                </AgentTrail>
                {canRunAgentActions(server.role) ? (
                    <AgentActionsMenu
                        agent={agent}
                        onDeleted={onDeleted}
                        server={server}
                        variant="ghost"
                    />
                ) : null}
            </div>
        </PageTopbar>
    );
}
