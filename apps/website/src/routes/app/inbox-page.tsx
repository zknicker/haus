import * as React from 'react';
import { ComputerDiskNotices } from '../../features/computers/computer-disk-notices.tsx';
import { InboxHeader } from '../../features/servers/inbox/inbox-header.tsx';
import { inboxLayout } from '../../features/servers/inbox/inbox-layout.ts';
import { InboxRail } from '../../features/servers/inbox/inbox-rail.tsx';
import { InboxSection, InboxSectionPending } from '../../features/servers/inbox/inbox-section.tsx';
import { unreadTriageKeyHint } from '../../features/servers/inbox/use-unread-triage-keys.ts';
import { PageBand } from '../../features/shell/page-band.tsx';
import { PageColumn } from '../../features/shell/page-column.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';
import { serverRouteModules } from './server-route-modules.ts';

const InboxActiveAgents = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).InboxActiveAgents,
}));
const InboxUnread = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).InboxUnread,
}));
const CloudAgentWorkDialog = React.lazy(async () => ({
    default: (await serverRouteModules.inbox()).CloudAgentWorkDialog,
}));

/**
 * The human Inbox: a lens over records that already exist elsewhere. It owns
 * no state, creates nothing, and rides the invalidations its sources already
 * emit. Each section reads its own query and states its own result.
 *
 * It is a page a person sits on to read, so the feed — who is reading, then the
 * conversation waiting on them — owns the reading column. Agent activity is
 * the glance beside it: a rail with the Agents meter (who is busiest this week,
 * and whether one is running away) over Happening now. When the Inbox pane is
 * too narrow for a rail — a second pane open beside it — the rail folds into
 * one strip between the greeting and Unread. The pane decides, through a
 * container query on the page's frame, never the window (`inbox-layout.ts`).
 * Wide, the feed and the rail scroll separately; narrow, the page scrolls as
 * one.
 *
 * The strip and the rail come from one owner (`InboxActiveAgents`), which sits
 * between the head and Unread so the strip lands there in the narrow column;
 * the rail places itself beside the feed, out of the feed's scroller. While that code loads the rail
 * draws its labels over neutral bodies, as Unread does, so section labels
 * arrive with the Server shell.
 *
 * The page fills the shell band like every other routed destination
 * (`PageBand`): "Haus › Inbox", and nothing at the trailing end — the day was
 * tried there and read as a fact torn from the greeting it belongs to.
 */
export function InboxPage() {
    useWindowTitle('Inbox');

    return (
        <>
            <PageBand overlay>
                <PageBand.Trail current="Inbox" />
            </PageBand>
            {/* The container the layout measures, around the page's own
                scroller: the shell frame clips, and every routed page that
                outgrows it scrolls itself (Tasks, Settings, Agent profile). A
                wide pane splits that scroller into the feed's and the rail's.
                It runs up under the band, so it carries the fade that keeps the
                trail legible over whatever scrolls beneath it. */}
            <div className={inboxLayout.frame} data-slot="inbox-frame">
                <div
                    aria-hidden="true"
                    className="transcript-edge-blur"
                    data-side="top"
                    data-slot="transcript-edge-blur"
                />
                <div className={inboxLayout.scroller}>
                    <PageColumn className={inboxLayout.column}>
                        <div className={inboxLayout.body}>
                            <div className={inboxLayout.feed}>
                                <InboxHeader />
                                <ComputerDiskNotices />
                                <React.Suspense
                                    fallback={
                                        <InboxRail
                                            agents={
                                                <InboxSectionPending label="Loading Agent activity" />
                                            }
                                            happeningNow={
                                                <InboxSectionPending label="Loading current Agent work" />
                                            }
                                        />
                                    }
                                >
                                    <InboxActiveAgents />
                                </React.Suspense>
                                <InboxSection
                                    meta={
                                        // Keys need a keyboard; a touch screen has none to hint at.
                                        <span className="pointer-coarse:hidden">
                                            {unreadTriageKeyHint}
                                        </span>
                                    }
                                    title="Unread"
                                >
                                    <React.Suspense
                                        fallback={
                                            <InboxSectionPending label="Loading unread chats" />
                                        }
                                    >
                                        <InboxUnread />
                                    </React.Suspense>
                                </InboxSection>
                            </div>
                        </div>
                    </PageColumn>
                </div>
            </div>
            <React.Suspense fallback={null}>
                <CloudAgentWorkDialog />
            </React.Suspense>
        </>
    );
}
