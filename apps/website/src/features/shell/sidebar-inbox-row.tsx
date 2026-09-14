import { Sidebar } from '@heroui-pro/react';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { HausGhost } from '../../components/haus-ghost.tsx';
import { useOptionalCurrentAgentActivity } from '../../hooks/agents/use-current-agent-activity.tsx';
import { inboxRoute } from '../servers/server-routes.ts';
import { resolveAgentActivityGhostTempo } from './agent-activity-ghost-tempo.ts';
import { RouteTabIcon } from './route-tab-presentation.tsx';

/** What the Inbox row wears in its icon column. The shell picks it per surface. */
export type SidebarInboxMark = 'ghost' | 'inbox';

/**
 * The sidebar's lead navigation row: Inbox, ahead of Search and Tasks.
 *
 * `mark` is the row's whole platform difference, and the shell decides it — the
 * row never asks what surface it is on.
 *
 * `ghost` is the macOS desktop. The Haus mark stands here, where a product's
 * wordmark would, because up in the titlebar strip the traffic lights already
 * lead that line. It draws at a 22px identity-mark box inside HeroUI's narrower
 * icon column, the same overflow the DM avatars already take. The column
 * centers it and does not shrink, so the label keeps the exact x of Search and
 * Tasks — which is why this row carries none of the optical nudge the DM rows
 * use.
 *
 * `inbox` is the web, where the mark leads the strip instead and the row is a
 * stock menu row: the route's own glyph at the same measure Search and Tasks
 * use, no overflow and no nudge to explain.
 *
 * `needsYouCount` badges the row with the Inbox's own "Needs you" total,
 * wearing the same chip the Chat rows wear for unread messages and, like them,
 * showing nothing at zero. The chip sits at the row's natural trailing edge.
 *
 * The row leads the sidebar on both surfaces, offset by half the shared shell
 * band so its midline meets the content topbar's across the divider
 * (`shell.css`) while the menu's own pitch continues under it.
 */
export function SidebarInboxRow({
    isCurrent,
    mark,
    needsYouCount,
    onPreload,
    slug,
}: {
    isCurrent: boolean;
    mark: SidebarInboxMark;
    needsYouCount: number;
    onPreload: () => void;
    slug: string;
}) {
    // The mesh drifts with the Server's live work wherever the mark is drawn,
    // so the tempo is read whether or not this row is the one drawing it.
    const tempo = resolveAgentActivityGhostTempo(useOptionalCurrentAgentActivity());

    return (
        <Sidebar.MenuItem
            href={inboxRoute(slug)}
            id="inbox"
            isCurrent={isCurrent}
            onHoverStart={onPreload}
            textValue="Inbox"
        >
            <Sidebar.MenuIcon>
                {mark === 'ghost' ? (
                    <HausGhost
                        animated
                        aria-hidden="true"
                        fill="iridescent"
                        size={22}
                        tempo={tempo}
                    />
                ) : (
                    <RouteTabIcon size={16} tab="inbox" />
                )}
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                <Sidebar.MenuLabel>Inbox</Sidebar.MenuLabel>
                {needsYouCount > 0 ? (
                    <UnreadCountChip
                        ariaLabel={`${needsYouCount} needs you`}
                        count={needsYouCount}
                    />
                ) : null}
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}
