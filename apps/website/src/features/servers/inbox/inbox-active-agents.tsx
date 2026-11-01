import { InboxStrip } from './inbox-strip.tsx';
import { useActiveAgentRows, useOpenActiveAgent } from './use-active-agent-rows.ts';
import { useHappeningNowRows, useOpenHappeningNowRow } from './use-happening-now-rows.ts';

/**
 * The Inbox's Agent activity — who moved this week and what is running now —
 * as the strip beside the greeting.
 *
 * This is the one owner of those reads, and of the one-second elapsed clock
 * Happening now runs on. The strip shows the glance and opens the full lists
 * on demand.
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
        <InboxStrip
            entries={entries}
            happeningNow={happeningNow}
            onOpenAgent={openAgent}
            onOpenRow={openRow}
        />
    );
}
