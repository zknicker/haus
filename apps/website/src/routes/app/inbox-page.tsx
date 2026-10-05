import * as React from 'react';
import { InboxHeader } from '../../features/servers/inbox/inbox-header.tsx';
import { InboxSection, InboxSectionPending } from '../../features/servers/inbox/inbox-section.tsx';
import { InboxTopbar } from '../../features/servers/inbox/inbox-topbar.tsx';
import { PageColumn } from '../../features/shell/page-column.tsx';
import { PageTopbar } from '../../features/shell/shell-topbar.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const InboxActiveAgents = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).InboxActiveAgents,
}));
const InboxUnread = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).InboxUnread,
}));
const InboxHappeningNow = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).InboxHappeningNow,
}));
const CloudAgentWorkDialog = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).CloudAgentWorkDialog,
}));

/**
 * The human Inbox: a lens over records that already exist elsewhere. It owns
 * no state, creates nothing, and rides the invalidations its sources already
 * emit. Each section reads its own query and states its own result.
 *
 * The order is the reading order: who is reading, then the Agents that moved
 * this week, then the conversation waiting on them, then what is moving
 * without them.
 *
 * The sections stack full width, one per band, in the page column's own
 * rhythm. They were two columns while a row ran three lines deep and a section
 * was a tall narrow thing; one-line rows make every section a wide shallow one,
 * and a wide shallow section wants the whole column — a row's title, preview,
 * and trailing meta all need width, and splitting the page took it from all
 * three at once.
 *
 * The page fills the shell band like every other routed destination
 * (`InboxTopbar`): the route's glyph and a single "Inbox" crumb where you are.
 * That is what lets the column stay stock — the greeting opens the page at the
 * ordinary top inset rather than rising into an empty band and measuring its
 * own offset off the frame's edge.
 */
export function InboxPage() {
    useWindowTitle('Inbox');

    return (
        <>
            <PageTopbar>
                <InboxTopbar />
            </PageTopbar>
            {/* The page's own scroller: the shell frame clips, and every routed
                page that outgrows it scrolls itself (Tasks, Settings, Agent profile). */}
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <PageColumn>
                    <InboxHeader />
                    <InboxSection title="Active this week">
                        <React.Suspense
                            fallback={<InboxSectionPending label="Loading Agent activity" />}
                        >
                            <InboxActiveAgents />
                        </React.Suspense>
                    </InboxSection>
                    <InboxSection title="Unread">
                        <React.Suspense
                            fallback={<InboxSectionPending label="Loading unread chats" />}
                        >
                            <InboxUnread />
                        </React.Suspense>
                    </InboxSection>
                    <InboxSection title="Happening now">
                        <React.Suspense
                            fallback={<InboxSectionPending label="Loading current Agent work" />}
                        >
                            <InboxHappeningNow />
                        </React.Suspense>
                    </InboxSection>
                </PageColumn>
            </div>
            <React.Suspense fallback={null}>
                <CloudAgentWorkDialog />
            </React.Suspense>
        </>
    );
}
