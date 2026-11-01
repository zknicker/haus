import * as React from 'react';
import { ComputerDiskNotices } from '../../features/computers/computer-disk-notices.tsx';
import { InboxHeader } from '../../features/servers/inbox/inbox-header.tsx';
import { inboxLayout } from '../../features/servers/inbox/inbox-layout.ts';
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
 * conversation waiting on them — owns the one column at every width. Agent
 * activity is the glance beside the greeting: a strip of the week's busiest
 * Agents, a runaway flagged, and what is running now, each opening its full
 * list (`InboxActiveAgents`). It draws nothing until its reads settle, and the
 * greeting sets the line's height, so its arrival moves nothing below it.
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
            {/* The frame around the page's own scroller: the shell frame clips, and every routed page that
                outgrows it scrolls itself (Tasks, Settings, Agent profile).
                It runs up under the band, so it carries the fade that keeps the
                trail legible over whatever scrolls beneath it. */}
            <div className={inboxLayout.frame} data-slot="inbox-frame">
                <div
                    aria-hidden="true"
                    className="transcript-edge-blur"
                    data-side="top"
                    data-slot="transcript-edge-blur"
                />
                <div className={inboxLayout.scroller} data-slot="inbox-scroller">
                    <PageColumn className={inboxLayout.column}>
                        <div className={inboxLayout.head}>
                            <InboxHeader />
                            <React.Suspense fallback={null}>
                                <InboxActiveAgents />
                            </React.Suspense>
                        </div>
                        <ComputerDiskNotices />
                        <InboxSection
                            meta={
                                // Keys need a keyboard; a touch screen has none to hint at.
                                <span className="pointer-coarse:hidden">{unreadTriageKeyHint}</span>
                            }
                            title="Unread"
                        >
                            <React.Suspense
                                fallback={<InboxSectionPending label="Loading unread chats" />}
                            >
                                <InboxUnread />
                            </React.Suspense>
                        </InboxSection>
                    </PageColumn>
                </div>
            </div>
            <React.Suspense fallback={null}>
                <CloudAgentWorkDialog />
            </React.Suspense>
        </>
    );
}
