import { type RefObject, useState } from 'react';
import {
    initialUnreadSelection,
    resolveSelectedRow,
    selectionAfterLeaving,
    stepSelection,
    type UnreadSelection,
} from './unread-row-model.ts';
import type { UnreadRow } from './unread-rows.ts';

/**
 * Which Unread card is selected, and the moves that change it (ADR 0050).
 * Exactly one card is selected whenever any is unread: the first, until the
 * viewer picks another. The selected card stays selected while newer
 * activity reorders the list around it; when it leaves — read here or
 * anywhere else — the card that slid into its place is selected, so reading
 * works down the list like a queue.
 *
 * Each move records whether focus was inside the list when it happened. If
 * it was, focus follows onto the newly selected card; if the viewer was on
 * the page itself, it stays there, so selecting a card never pulls focus.
 */
export function useUnreadTriage(
    rows: readonly UnreadRow[] | null,
    listRef: RefObject<HTMLElement | null>
) {
    const [selection, setSelection] = useState<UnreadSelection>(initialUnreadSelection);
    const selected = rows ? resolveSelectedRow(rows, selection) : null;

    // Pin the selection to the row itself, not to its index, so it survives a
    // reorder; the index rides along for the moment it leaves.
    if (selected && selected.row.id !== selection.id) {
        setSelection({ carryFocus: false, id: selected.row.id, index: selected.index });
    } else if (selected && selected.index !== selection.index) {
        setSelection({ ...selection, index: selected.index });
    }

    const focusInList = () => listRef.current?.contains(document.activeElement) ?? false;

    return {
        /** Whether focus follows onto the selected card as it is selected. */
        carryFocus: selection.carryFocus,
        /** Selects the card after `row`, which is leaving because it was just read. */
        leave(row: UnreadRow) {
            if (rows) {
                setSelection(selectionAfterLeaving(rows, row.id, focusInList()));
            }
        },
        selected: selected?.row ?? null,
        /** Selects `row` as focus moves into it; focus is already where the reader put it. */
        select(row: UnreadRow) {
            const index = rows?.findIndex((candidate) => candidate.id === row.id) ?? -1;
            setSelection({ carryFocus: false, id: row.id, index: Math.max(index, 0) });
        },
        /** J and K. */
        step(step: -1 | 1) {
            if (rows) {
                setSelection(stepSelection(rows, selection, step, focusInList()));
            }
        },
    };
}
