import type { Agent } from '@haus/api';
import * as React from 'react';
import { type ActiveAgent, busiestWeek, weekShare } from './active-agents.ts';
import { InboxAgentsRow } from './inbox-agents-row.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';

/**
 * The Agents meter: every Agent that moved this week, ranked, one row each,
 * with each bar measured against the busiest week in the list. The strip's
 * "+N" opens it in a popover, behind the chips it folds down to.
 *
 * It rides the Inbox's row list, so rows arrive, leave, and reorder on the
 * same spring every other Inbox list uses, and a still week settles into the
 * same one-row slot.
 */
export function InboxAgentsList({
    entries,
    listId,
    onOpenAgent,
}: {
    entries: readonly ActiveAgent[];
    /** Scopes layout animation, so this list never pairs rows with another Inbox list. */
    listId: string;
    onOpenAgent: (agent: Agent) => void;
}) {
    const rows = React.useMemo(
        () => entries.map((entry) => ({ entry, id: entry.agent.id })),
        [entries]
    );
    const busiest = busiestWeek(entries);

    return (
        <InboxRowList
            emptyLabel="No activity this week."
            listId={listId}
            renderRow={({ entry }) => (
                <InboxAgentsRow
                    activity={entry}
                    onOpen={() => onOpenAgent(entry.agent)}
                    share={weekShare(entry, busiest)}
                />
            )}
            rows={rows}
        />
    );
}
