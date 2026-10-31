import { HappeningNowList } from './happening-now-list.tsx';
import { InboxAgentsList } from './inbox-agents-list.tsx';
import { InboxRail } from './inbox-rail.tsx';
import { InboxSectionPending } from './inbox-section.tsx';
import { InboxStrip } from './inbox-strip.tsx';
import { useActiveAgentRows, useOpenActiveAgent } from './use-active-agent-rows.ts';
import { useHappeningNowRows, useOpenHappeningNowRow } from './use-happening-now-rows.ts';

/**
 * The Inbox's Agent activity — who moved this week and what is running now —
 * in both of the page's arrangements at once.
 *
 * This is the one owner of those reads. It renders the narrow strip and the
 * wide rail side by side in the feed's flow, and the Inbox pane's
 * container query shows whichever fits (`inbox-layout.ts`). Splitting them
 * into two data-aware leaves would run every read, and the one-second elapsed
 * clock, twice for a page that only ever shows one of them.
 *
 * The meter is not a roster. It carries only the Agents that processed tokens
 * this week or are in a turn now; the full directory is the sidebar's job.
 */
export function InboxActiveAgents() {
    const entries = useActiveAgentRows();
    const happeningNow = useHappeningNowRows();
    const openAgent = useOpenActiveAgent();
    const openRow = useOpenHappeningNowRow();

    return (
        <>
            <InboxStrip
                entries={entries}
                happeningNow={happeningNow}
                onOpenAgent={openAgent}
                onOpenRow={openRow}
            />
            <InboxRail
                agents={
                    entries === null ? (
                        <InboxSectionPending label="Loading Agent activity" />
                    ) : (
                        <InboxAgentsList
                            entries={entries}
                            listId="inbox-agents"
                            onOpenAgent={openAgent}
                        />
                    )
                }
                happeningNow={
                    happeningNow === null ? (
                        <InboxSectionPending label="Loading current Agent work" />
                    ) : (
                        <HappeningNowList
                            listId="inbox-happening-now"
                            onOpenRow={openRow}
                            rows={happeningNow}
                        />
                    )
                }
            />
        </>
    );
}
