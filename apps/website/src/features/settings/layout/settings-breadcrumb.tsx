import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useMember } from '../../../hooks/members/use-member.ts';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { useConnection } from '../../../hooks/servers/use-connection.ts';
import { computerLabel } from '../../computers/presentation.ts';
import { humanDisplayName } from '../../servers/human-identity.ts';
import { serverSettingsRoute, serverSettingsSectionRoute } from '../../servers/server-routes.ts';
import type { BandCrumb } from '../../shell/band-trail.ts';
import { PageBand } from '../../shell/page-band.tsx';
import { type SettingsRouteTab, settingsNavItems } from './navigation.ts';

/**
 * The way back out of a record inside Settings: "Haus › Settings › Members ›
 * Zach". A top-level page draws no trail, since the rail's current row, the
 * page title and the tab already say where you are.
 */
export function SettingsBreadcrumb({
    pathname,
    section,
    serverId,
    slug,
}: {
    pathname: string;
    section: SettingsRouteTab | undefined;
    serverId: string;
    slug: string;
}) {
    const leaf = useLeafCrumb(pathname, serverId);
    const crumb = section ? resolveCrumb(section) : undefined;

    if (!(crumb && isRecordRoute(pathname))) {
        return null;
    }

    const settings: BandCrumb = { href: serverSettingsRoute(slug), label: 'Settings' };
    const page: BandCrumb = {
        href: serverSettingsSectionRoute(slug, crumb.id),
        label: crumb.label,
    };
    return (
        <PageBand>
            <PageBand.Trail
                crumbs={[settings, page]}
                current={leaf ? leafCrumb(leaf) : undefined}
            />
        </PageBand>
    );
}

/** A member leads with their face; a connection's mark is already the page's own header. */
function leafCrumb(leaf: LeafCrumb): BandCrumb {
    return leaf.kind === 'human'
        ? {
              label: leaf.name,
              mark: <EntityAvatar name={leaf.name} size={18} src={leaf.avatarUrl} />,
          }
        : { label: leaf.name };
}

type LeafCrumb =
    | { avatarUrl: string | null; kind: 'human'; name: string }
    | { kind: 'connection' | 'device' | 'project'; name: string };

/**
 * The record a section sub-route is showing: a human in Members, one MCP
 * connection in Connections, one device in Devices, or one Project in Projects. Agents have their own page outside Settings.
 *
 * Read here rather than pushed up from the detail page: these are the queries
 * those pages already run, so React Query serves them from the same cache
 * entries and nothing has to plumb a name back through context.
 */
function useLeafCrumb(pathname: string, serverId: string): LeafCrumb | undefined {
    const [userId, connectionId, computerId, projectId] = recordMarkers.map((marker) =>
        matchRecordId(pathname, marker)
    );
    const member = useMember(serverId, userId);
    const connection = useConnection(serverId, connectionId).data;
    const computer = useComputers(serverId, { enabled: computerId !== undefined }).data?.find(
        (candidate) => candidate.id === computerId
    );
    const project = useProjects(projectId === undefined ? undefined : serverId).data?.find(
        (candidate) => candidate.chatId === projectId
    );

    if (userId && member.data) {
        return {
            avatarUrl: member.data.avatarUrl,
            kind: 'human',
            name: humanDisplayName(member.data),
        };
    }
    if (connectionId && connection) {
        return { kind: 'connection', name: connection.name };
    }
    if (computerId && computer) {
        return { kind: 'device', name: computerLabel(computer) };
    }
    if (projectId && project) {
        return { kind: 'project', name: project.name };
    }
    return undefined;
}

function isRecordRoute(pathname: string) {
    return recordMarkers.some((marker) => matchRecordId(pathname, marker) !== undefined);
}

const recordMarkers = [
    '/settings/members/humans/',
    '/settings/connections/',
    '/settings/computers/',
    '/settings/projects/',
];

function matchRecordId(pathname: string, marker: string): string | undefined {
    const start = pathname.indexOf(marker);
    if (start === -1) {
        return undefined;
    }
    const id = pathname.slice(start + marker.length).split('/')[0];
    return id ? decodeURIComponent(id) : undefined;
}

function resolveCrumb(section: SettingsRouteTab) {
    const item = settingsNavItems.find((candidate) => candidate.id === section);
    if (!item) {
        return undefined;
    }

    return { id: item.id, label: item.label };
}
