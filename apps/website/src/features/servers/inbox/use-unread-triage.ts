import { type RefObject, useState } from 'react';
import {
    initialUnreadSelection,
    resolveOpenRow,
    selectionAfterLeaving,
    stepSelection,
    type UnreadSelection,
} from './unread-row-model.ts';
import type { UnreadRow } from './unread-rows.ts';

/**
 * Which Unread row is open, and the moves that change it (ADR 0050). Exactly
 * one row is open whenever any is unread: the first, until the viewer picks
 * another. The open row stays open while newer activity reorders the list
 * around it; when it leaves — read here or anywhere else — the row that slid
 * into its place opens, so reading works down the list like a queue.
 *
 * Each move records whether focus was inside the list when it happened. If
 * it was, focus follows into the newly open row; if the viewer was on the
 * page itself, it stays there, so opening a row never pulls focus.
 */
export function useUnreadTriage(
    rows: readonly UnreadRow[] | null,
    listRef: RefObject<HTMLElement | null>
) {
    const [selection, setSelection] = useState<UnreadSelection>(initialUnreadSelection);
    const open = rows ? resolveOpenRow(rows, selection) : null;

    // Pin what is open to the row itself, not to its index, so it survives a
    // reorder; the index rides along for the moment it leaves.
    if (open && open.row.id !== selection.id) {
        setSelection({ carryFocus: false, id: open.row.id, index: open.index });
    } else if (open && open.index !== selection.index) {
        setSelection({ ...selection, index: open.index });
    }

    const focusInList = () => listRef.current?.contains(document.activeElement) ?? false;

    return {
        /** Whether focus follows into the open row as it opens. */
        carryFocus: selection.carryFocus,
        /** Opens the row after `row`, which is leaving because it was just read. */
        leave(row: UnreadRow) {
            if (rows) {
                setSelection(selectionAfterLeaving(rows, row.id, focusInList()));
            }
        },
        open: open?.row ?? null,
        /** Opens `row` in place. */
        select(row: UnreadRow) {
            const index = rows?.findIndex((candidate) => candidate.id === row.id) ?? -1;
            setSelection({ carryFocus: focusInList(), id: row.id, index: Math.max(index, 0) });
        },
        /** J and K. */
        step(step: -1 | 1) {
            if (rows) {
                setSelection(stepSelection(rows, selection, step, focusInList()));
            }
        },
    };
}
