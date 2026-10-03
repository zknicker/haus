import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ComputerPage } from '../../features/computers/computer-page.tsx';
import { HumanProfile } from '../../features/members/human-profile/human-profile.tsx';
import { HumanDirectory } from '../../features/servers/human-directory.tsx';
import { RequireOperator } from '../../features/servers/require-operator.tsx';
import { useServerContext } from '../../features/servers/server-context.ts';
import {
    serverArchivedChatsRoute,
    serverSettingsSectionRoute,
} from '../../features/servers/server-routes.ts';
import type { SettingsNavLinkId } from '../../features/settings/layout/navigation.ts';
import { ConnectionPage } from '../../features/settings/mcp/connection-page.tsx';
import { ConnectionsPage } from '../../features/settings/mcp/connections-page.tsx';
import { useConnectionSignIn } from '../../features/settings/mcp/use-connection-sign-in.ts';
import { ModelsSettings } from '../../features/settings/models/page.tsx';
import { PreferencesSettings } from '../../features/settings/preferences/page.tsx';
import { ProfileSettings } from '../../features/settings/profile/page.tsx';
import { ServerSettings } from '../../features/settings/server/page.tsx';
import { ServersSettings } from '../../features/settings/servers/page.tsx';
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
const sections: Record<string, (context: SectionContext) => ReactNode> = {
    computers: ({ server }) => (
        <RequireOperator
            description="Computers are attached and removed by Server operators."
            role={server.role}
        >
            <ComputerPage serverId={server.id} serverSlug={server.slug} />
        </RequireOperator>
    ),
    connections: () => <ConnectionsPage embedded />,
    members: ({ server }) => <MembersSection server={server} />,
    models: ({ server }) => <ModelsSettings serverId={server.id} />,
    preferences: () => <PreferencesSettings />,
    profile: ({ server }) => <ProfileSettings serverId={server.id} />,
    server: ({ server }) => <ServerSettings server={server} />,
    servers: () => <ServersSettings />,
    skills: ({ server }) => <SkillsSettings serverId={server.id} />,
    usage: ({ server }) => <AgentsUsageOverview serverId={server.id} />,
};

/**
 * Entry points, not sections. Archived chats is a chat list with its own
 * standalone route, and the settings rail links out to it. The rail builds every row's href from its id, so the click lands here
 * and hands off.
 */
const linkedSectionRoutes: Record<SettingsNavLinkId, (server: ServerSummary) => string> = {
    archived: (server) => serverArchivedChatsRoute(server.slug),
};

const linkedSections = new Map<string, (server: ServerSummary) => string>(
    Object.entries(linkedSectionRoutes)
);

/** Sections that moved; old links still resolve. */
const renamedSections: Record<string, string> = {
    appearance: 'preferences',
    browser: 'computers',
    updates: 'preferences',
};

export function SettingsSectionRoute() {
    const { section = 'profile' } = useParams();
    const { server } = useServerContext();
    const renamed = renamedSections[section];
    if (renamed) {
        return <Navigate replace to={`../${renamed}`} />;
    }
    const linkedTo = linkedSections.get(section);
    if (linkedTo) {
        return <Navigate replace to={linkedTo(server)} />;
    }
    const render = sections[section];
    if (!render) {
        return <Navigate replace to="../profile" />;
    }
    return render({ server });
}

function MembersSection({ server }: { server: ServerSummary }) {
    const directory = useMembers(server.id);
    const canManage = server.role === 'owner' || server.role === 'admin';

    if (directory.error && !directory.data) {
        return <p className="m-auto text-danger text-sm">Couldn’t load humans.</p>;
    }
    return (
        <HumanDirectory
            canManage={canManage}
            directory={directory.data}
            serverId={server.id}
            serverSlug={server.slug}
        />
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
            description="MCP connections are managed by Server operators."
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
