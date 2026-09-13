import type { Agent } from '@haus/api';
import { InboxIdentityMark, InboxRow, InboxRowBody, InboxRowMeta } from './inbox-row.tsx';
import { InboxRowList } from './inbox-section-rows.tsx';
import type { NeedsYouRow } from './needs-you-rows.ts';

/**
 * Everything waiting on this human, as one list. Every row is the same shape —
 * the Agent behind it, what it is, the one line that says why, and where it
 * came from — so the eye can run down the column instead of re-reading each
 * row's layout.
 *
 * No row acts. An Ask's recommended step is offered in the Thread the row
 * peeks, where the whole Ask is readable; here it would only be a second right
 * edge in a column whose whole value is that every row ends the same way.
 */
export function NeedsYouList({
    agentById,
    onOpenRow,
    rows,
}: {
    agentById: ReadonlyMap<string, Agent>;
    onOpenRow: (row: NeedsYouRow) => void;
    rows: readonly NeedsYouRow[];
}) {
    return (
        <InboxRowList
            emptyLabel="Nothing needs you."
            listId="inbox-needs-you"
            renderRow={(row) => (
                <InboxRow label={row.title} onOpen={() => onOpenRow(row)}>
                    <InboxIdentityMark
                        agent={(row.agentId && agentById.get(row.agentId)) || null}
                        avatarUrl={row.avatarUrl}
                        name={row.markName}
                    />
                    <InboxRowBody preview={row.preview} title={row.title} />
                    <InboxRowMeta>{row.meta}</InboxRowMeta>
                </InboxRow>
            )}
            rows={rows}
        />
    );
}
