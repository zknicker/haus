import { hasServerAdminAuthority } from '@haus/api/membership';
import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ComputerPage } from '../../features/computers/computer-page.tsx';
import { DevicesPage } from '../../features/computers/devices-page.tsx';
import { HumanProfile } from '../../features/members/human-profile/human-profile.tsx';
import { ArchivedChatsPage } from '../../features/servers/chat/archived-chats-page.tsx';
import { MembersPage } from '../../features/servers/members-page.tsx';
import { RequireOperator } from '../../features/servers/require-operator.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';
import { serverSettingsSectionRoute } from '../../features/servers/server-routes.ts';
import { AppearanceSettings } from '../../features/settings/appearance/page.tsx';
import { GitSettings } from '../../features/settings/git/page.tsx';
import type { SettingsRouteTab } from '../../features/settings/layout/navigation.ts';
import { ConnectionPage } from '../../features/settings/mcp/connection-page.tsx';
import { ConnectionsPage } from '../../features/settings/mcp/connections-page.tsx';
import { useConnectionSignIn } from '../../features/settings/mcp/use-connection-sign-in.ts';
import { ModelsSettings } from '../../features/settings/models/page.tsx';
import { NotificationsSettings } from '../../features/settings/notifications/page.tsx';
import { PreferencesSettings } from '../../features/settings/preferences/page.tsx';
import { ProfileSettings } from '../../features/settings/profile/page.tsx';
import { ProjectSettings, ProjectsSettings } from '../../features/settings/projects/page.tsx';
import { ReposSettings } from '../../features/settings/repos/page.tsx';
import { ServerSettings } from '../../features/settings/server/page.tsx';
import { ServersSettings } from '../../features/settings/servers/page.tsx';
import { ShortcutsSettings } from '../../features/settings/shortcuts/page.tsx';
import { SkillsSettings } from '../../features/skills/skills-settings.tsx';
import { AgentsUsageOverview } from '../../features/usage/agents-usage-overview.tsx';
import { useMember } from '../../hooks/members/use-member.ts';
import { useConnection } from '../../hooks/servers/use-connection.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import type { ServerSummary } from '../../lib/haus-server.tsx';

interface SectionContext {
    server: ServerSummary;
}

/** Section registry: one renderer per settings section, no dispatch chain. */
const sectionRenderers: Record<SettingsRouteTab, (context: SectionContext) => ReactNode> = {
    appearance: () => <AppearanceSettings />,
    archived: ({ server }) => <ArchivedChatsPage server={server} />,
    computers: ({ server }) => (
        <RequireOperator description={devicesOperatorOnly} role={server.role}>
            <DevicesPage serverId={server.id} serverSlug={server.slug} />
        </RequireOperator>
    ),
    connections: () => <ConnectionsPage embedded />,
    general: ({ server }) => <ServerSettings server={server} />,
    git: () => <GitSettings />,
    members: ({ server }) => <MembersSection server={server} />,
    models: ({ server }) => (
        <ModelsSettings
            canManage={hasServerAdminAuthority(server.role)}
            isOwner={server.role === 'owner'}
            serverId={server.id}
        />
    ),
    notifications: () => <NotificationsSettings />,
    preferences: () => <PreferencesSettings />,
    profile: ({ server }) => <ProfileSettings serverId={server.id} />,
    projects: () => <ProjectsSettings />,
    repos: () => <ReposSettings />,
    servers: () => <ServersSettings />,
    shortcuts: () => <ShortcutsSettings />,
    skills: ({ server }) => <SkillsSettings serverId={server.id} />,
    usage: ({ server }) => <AgentsUsageOverview serverId={server.id} />,
};

const sections = new Map<string, (context: SectionContext) => ReactNode>(
    Object.entries(sectionRenderers)
);

/** Sections that moved; old links still resolve. */
const renamedSections: Record<string, string> = {
    browser: 'computers',
    server: 'general',
    updates: 'preferences',
};

const devicesOperatorOnly = 'Devices are attached and removed by Server operators.';

export function SettingsSectionRoute() {
    const { section = 'profile' } = useParams();
    const { server } = useServerContext();
    const renamed = renamedSections[section];
    if (renamed) {
        return <Navigate replace to={`../${renamed}`} />;
    }
    const render = sections.get(section);
    if (!render) {
        return <Navigate replace to="../profile" />;
    }
    return render({ server });
}

function MembersSection({ server }: { server: ServerSummary }) {
    const directory = useMembers(server.id);

    if (directory.error && !directory.data) {
        return <p className="text-danger m-auto text-sm">Couldn’t load members.</p>;
    }
    return <MembersPage directory={directory.data} serverId={server.id} serverSlug={server.slug} />;
}

/** One Project's settings, a record inside Settings → Projects. */
export function SettingsProjectRoute() {
    const { projectId = '' } = useParams();
    const { server } = useServerContext();
    return <ProjectSettings key={projectId} projectId={projectId} serverId={server.id} />;
}

export function SettingsDeviceRoute() {
    const { computerId = '' } = useParams();
    const { server } = useServerContext();
    return (
        <RequireOperator description={devicesOperatorOnly} role={server.role}>
            <ComputerPage
                computerId={computerId}
                key={computerId}
                serverId={server.id}
                serverSlug={server.slug}
            />
        </RequireOperator>
    );
}

/**
 * A human member's detail, inside Settings.
 *
 * Humans are records in the Members directory, which is a settings section, so
 * opening one of its rows stays in Settings; the breadcrumb carries the extra
 * level. An Agent is a first-class record and has its own page instead.
 */
export function SettingsHumanRoute() {
    const { userId = '' } = useParams();
    const { server } = useServerContext();
    const member = useMember(server.id, userId);

    if (!member.data && member.error?.data?.code === 'NOT_FOUND') {
        return <Navigate replace to={serverSettingsSectionRoute(server.slug, 'members')} />;
    }

    return (
        <HumanProfile
            error={member.data ? undefined : member.error?.message}
            key={userId}
            member={member.data}
            server={server}
            userId={userId}
            viewerUserId={server.viewerUserId}
        />
    );
}

/**
 * One MCP connection's page, inside Settings → Connections. A connection that
 * is removed (from this page or anywhere else) or never existed sends the
 * reader back to the list once the Server's list says so.
 */
export function SettingsConnectionRoute() {
    const { connectionId = '' } = useParams();
    const { server } = useServerContext();
    const connection = useConnection(server.id, connectionId);
    // Above the per-connection key: adding an account signs in to the new
    // connection after its page replaces this one.
    const signIn = useConnectionSignIn({
        connected: connection.data?.connected ?? false,
        connectionId,
        serverId: server.id,
    });

    if (connection.data === null) {
        return <Navigate replace to={serverSettingsSectionRoute(server.slug, 'connections')} />;
    }

    return (
        <RequireOperator
            description="Connections are managed by Server operators."
            role={server.role}
        >
            <ConnectionPage
                connectionId={connectionId}
                key={connectionId}
                serverId={server.id}
                signIn={signIn}
            />
        </RequireOperator>
    );
}
