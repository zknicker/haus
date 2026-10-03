import { Breadcrumbs } from '@heroui/react';
import { ComputerIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useMember } from '../../../hooks/members/use-member.ts';
import { useConnection } from '../../../hooks/servers/use-connection.ts';
import { humanDisplayName } from '../../servers/human-identity.ts';
import {
    inboxRoute,
    serverSettingsRoute,
    serverSettingsSectionRoute,
} from '../../servers/server-routes.ts';
import { useBrowserWorkspace } from '../../shell/browser-workspace-context.tsx';
import { PageTopbar, useTopbarIsWindowBand } from '../../shell/shell-topbar.tsx';
import { type SettingsRouteTab, settingsNavItems } from './navigation.ts';

/**
 * Where you are, on one line at the top-left of the settings content column.
 *
 * This component owns that placement. On the web the content column's top
 * band is that line, so the trail fills it through `PageTopbar`. On desktop
 * the band is the window band — the tab area, which already names the page
 * in its title or tab — so the trail renders as the column's own first row,
 * at the same height and gutter, instead of landing beside the tabs.
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
    const inWindowBand = useTopbarIsWindowBand();
    const workspaceMode = useBrowserWorkspace()?.mode;
    const crumb = section ? resolveCrumb(section) : undefined;

    if (!crumb) {
        return null;
    }

    const sectionHref = serverSettingsSectionRoute(slug, crumb.id);
    const trail = (
        <div className="flex min-w-0 shrink items-center gap-2">
            {crumb.icon ? (
                <Icon
                    aria-hidden="true"
                    className="shrink-0 text-muted"
                    icon={crumb.icon}
                    size={16}
                />
            ) : null}
            <Breadcrumbs className="min-w-0">
                {/* The product leads every trail, and it is a destination: the
                    Inbox is the app's front page, the same place the sidebar's
                    mark goes. */}
                <Breadcrumbs.Item href={inboxRoute(slug)}>Haus</Breadcrumbs.Item>
                <Breadcrumbs.Item href={serverSettingsRoute(slug)}>Settings</Breadcrumbs.Item>
                <Breadcrumbs.Item href={leaf ? sectionHref : undefined}>
                    {crumb.label}
                </Breadcrumbs.Item>
                {leaf ? (
                    <Breadcrumbs.Item>
                        {/* A member leads with their face everywhere else in
                            the app, so their crumb does too. A connection's
                            mark is already the page's own header. */}
                        <span className="flex min-w-0 items-center gap-1.5">
                            {leaf.kind === 'human' ? (
                                <EntityAvatar name={leaf.name} size={18} src={leaf.avatarUrl} />
                            ) : null}
                            <span className="min-w-0 truncate">{leaf.name}</span>
                        </span>
                    </Breadcrumbs.Item>
                ) : null}
            </Breadcrumbs>
        </div>
    );

    if (inWindowBand) {
        // The 16px section icon centers under the band's 20px leading mark —
        // the page title in split mode, the first tab in expanded mode.
        const inset =
            workspaceMode === 'expanded'
                ? 'ps-[calc(var(--shell-band-mark-start-expanded)_+_(var(--shell-tab-mark-size)_-_1rem)_/_2)]'
                : 'ps-[calc(var(--shell-band-mark-start-split)_+_(var(--shell-tab-mark-size)_-_1rem)_/_2)]';
        return (
            <div
                className={`flex h-[var(--app-shell-band-height)] shrink-0 items-center pe-3 ${inset}`}
            >
                {trail}
            </div>
        );
    }
    return <PageTopbar>{trail}</PageTopbar>;
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
    icon: ComputerIcon,
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

    return { icon: item.icon, id: item.id, label: item.label };
}
