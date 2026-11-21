import type { Agent } from '@haus/api';
import * as React from 'react';
import { type ActiveAgent, busiestWeek, weekShare } from './active-agents.ts';
import { CaptainActivityRow } from './captain-activity-row.tsx';
import { StripRowList } from './strip-section-rows.tsx';

/**
 * The Agents meter: every Agent that moved this week, ranked, one row each,
 * with each bar measured against the busiest week in the list. The strip's
 * "+N" opens it in a popover, behind the chips it folds down to.
 *
 * It rides the strip's row list, so rows arrive, leave, and reorder on the
 * same spring every other strip list uses, and a still week settles into the
 * same one-row slot.
 */
export function CaptainActivityList({
    entries,
    listId,
    onOpenAgent,
}: {
    entries: readonly ActiveAgent[];
    /** Scopes layout animation, so this list never pairs rows with another strip list. */
    listId: string;
    onOpenAgent: (agent: Agent) => void;
}) {
    const rows = React.useMemo(
        () => entries.map((entry) => ({ entry, id: entry.agent.id })),
        [entries]
    );
    const busiest = busiestWeek(entries);

    return (
        <StripRowList
            emptyLabel="No activity this week."
            listId={listId}
            renderRow={({ entry }) => (
                <CaptainActivityRow
                    activity={entry}
                    onOpen={() => onOpenAgent(entry.agent)}
                    share={weekShare(entry, busiest)}
                />
            )}
            rows={rows}
        />
    );
}
