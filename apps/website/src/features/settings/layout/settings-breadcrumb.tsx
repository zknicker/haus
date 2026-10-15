import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useMember } from '../../../hooks/members/use-member.ts';
import { useConnection } from '../../../hooks/servers/use-connection.ts';
import { humanDisplayName } from '../../servers/human-identity.ts';
import { serverSettingsRoute, serverSettingsSectionRoute } from '../../servers/server-routes.ts';
import type { BandCrumb } from '../../shell/band-trail.ts';
import { PageBand } from '../../shell/page-band.tsx';
import { type SettingsRouteTab, settingsNavItems } from './navigation.ts';

/**
 * Where you are, on one line at the top-left of the settings content column.
 *
 * The content column's top band is that line, so the trail fills it through
 * `PageBand` (on desktop, the band inside the Settings tab).
 *
 * The trail is the product, then Settings, then the page:
 * "Haus › Settings › Profile". The rail's group headings (Preferences,
 * Server) are not crumbs — they are headings in the rail, not places — and
 * naming them here made the trail read as a path through pages that do not
 * exist.
 *
 * Every crumb but the last is a destination: Haus is the Inbox, the app's
 * front page, and Settings is the settings root. A page stops being the
 * destination once you are inside one of its records, so it takes an href
 * and the record becomes the current crumb.
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

    if (!crumb) {
        return null;
    }

    const settings: BandCrumb = { href: serverSettingsRoute(slug), label: 'Settings' };
    const page: BandCrumb = {
        href: serverSettingsSectionRoute(slug, crumb.id),
        label: crumb.label,
    };
    return (
        <PageBand>
            {/* A page stops being the destination once you are inside one of its records. */}
            <PageBand.Trail
                crumbs={leaf ? [settings, page] : [settings]}
                current={leaf ? leafCrumb(leaf) : crumb.label}
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
    | { kind: 'connection'; name: string };

/**
 * The record a section sub-route is showing: a human in Members, or one MCP
 * connection in Connections. Agents have their own page outside Settings.
 *
 * Read here rather than pushed up from the detail page: these are the queries
 * those pages already run, so React Query serves them from the same cache
 * entries and nothing has to plumb a name back through context.
 */
function useLeafCrumb(pathname: string, serverId: string): LeafCrumb | undefined {
    const userId = matchRecordId(pathname, '/settings/members/humans/');
    const connectionId = matchRecordId(pathname, '/settings/connections/');
    const member = useMember(serverId, userId);
    const connection = useConnection(serverId, connectionId).data;

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
    return undefined;
}

function matchRecordId(pathname: string, marker: string): string | undefined {
    const start = pathname.indexOf(marker);
    if (start === -1) {
        return undefined;
    }
    const id = pathname.slice(start + marker.length).split('/')[0];
    return id ? decodeURIComponent(id) : undefined;
}

/**
 * Computers is not in the nav item list — its rows come from the roster — so
 * it names its own place in Settings.
 */
const computersCrumb = {
    id: 'computers',
    label: 'Computers',
} as const;

function resolveCrumb(section: SettingsRouteTab) {
    if (section === computersCrumb.id) {
        return computersCrumb;
    }

    const item = settingsNavItems.find((candidate) => candidate.id === section);
    if (!item) {
        return undefined;
    }

    return { id: item.id, label: item.label };
}
