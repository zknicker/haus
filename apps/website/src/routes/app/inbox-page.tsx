import { CloudAgentWorkDialog } from '../../features/cloud-agents/cloud-agent-work-dialog.tsx';
import { AskThreadDialog } from '../../features/servers/inbox/ask-thread-dialog.tsx';
import { InboxActiveAgents } from '../../features/servers/inbox/inbox-active-agents.tsx';
import { InboxConversations } from '../../features/servers/inbox/inbox-conversations.tsx';
import { InboxHappeningNow } from '../../features/servers/inbox/inbox-happening-now.tsx';
import { InboxHeader } from '../../features/servers/inbox/inbox-header.tsx';
import { InboxNeedsYou } from '../../features/servers/inbox/inbox-needs-you.tsx';
import { InboxTopbar } from '../../features/servers/inbox/inbox-topbar.tsx';
import { PageColumn } from '../../features/shell/page-column.tsx';
import { PageTopbar } from '../../features/shell/shell-topbar.tsx';
import { useWindowTitle } from '../../hooks/shell/use-window-title.ts';

/**
 * The human Inbox: a lens over records that already exist elsewhere. It owns
 * no state, creates nothing, and rides the invalidations its sources already
 * emit. Each section reads its own query and states its own result.
 *
 * The order is the reading order: who is reading, then the Agents that moved
 * this week, then what is waiting on this person, then the conversation
 * waiting on them, then what is moving without them.
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
            <PageColumn>
                <InboxHeader />
                <InboxActiveAgents />
                <InboxNeedsYou />
                <InboxConversations />
                <InboxHappeningNow />
            </PageColumn>
            <AskThreadDialog />
            <CloudAgentWorkDialog />
        </>
    );
}
