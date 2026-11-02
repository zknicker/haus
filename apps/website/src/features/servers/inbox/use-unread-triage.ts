import { type RefObject, useEffect, useRef, useState } from 'react';
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
 *
 * The selection is drawn (a ring) only while the keys drive it, as a focus
 * ring is keyboard-only: J and K, and E advancing past a read card, show it;
 * focus moving into a card — typing a reply, clicking — selects it unringed,
 * because there the reader already knows which card they are in.
 *
 * Opening a card leaves the Inbox in its own tab, and Back mounts it again,
 * so the selection outlives the page per Server: the list comes back on the
 * card it was on — or, when that one was read in the conversation, the card
 * that slid into its place — scrolled into view.
 */
export function useUnreadTriage(
    serverId: string,
    rows: readonly UnreadRow[] | null,
    listRef: RefObject<HTMLElement | null>
) {
    const [selection, setSelection] = useState<UnreadSelection>(() => {
        const remembered = rememberedSelections.get(serverId);
        return remembered ? { ...remembered, carryFocus: false } : initialUnreadSelection;
    });
    const [ringed, setRinged] = useState(false);
    const selected = rows ? resolveSelectedRow(rows, selection) : null;
    useEffect(() => {
        rememberedSelections.set(serverId, selection);
    }, [selection, serverId]);
    useScrollRestoredSelection(listRef, selected?.index ?? null, selection.id !== null);

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
        /** Selects the card after `row`, which is leaving because it was just read; `byKey` for E. */
        leave(row: UnreadRow, byKey: boolean) {
            if (rows) {
                setSelection(selectionAfterLeaving(rows, row.id, focusInList()));
                setRinged(byKey);
            }
        },
        /** Whether the selection is drawn: only while the keys drive it. */
        ringed,
        selected: selected?.row ?? null,
        /** Selects `row` as focus moves into it; focus is already where the reader put it. */
        select(row: UnreadRow) {
            const index = rows?.findIndex((candidate) => candidate.id === row.id) ?? -1;
            setSelection({ carryFocus: false, id: row.id, index: Math.max(index, 0) });
            setRinged(false);
        },
        /** J and K. */
        step(step: -1 | 1) {
            if (rows) {
                setSelection(stepSelection(rows, selection, step, focusInList()));
                setRinged(true);
            }
        },
    };
}

const rememberedSelections = new Map<string, UnreadSelection>();

/**
 * Brings a selection restored from an earlier visit into view, once, when the
 * cards first paint; a first card needs no scroll.
 */
function useScrollRestoredSelection(
    listRef: RefObject<HTMLElement | null>,
    index: number | null,
    restored: boolean
) {
    const pending = useRef(restored);
    useEffect(() => {
        if (!pending.current || index === null) {
            return;
        }
        pending.current = false;
        if (index > 0) {
            listRef.current
                ?.querySelector('[data-selected]')
                ?.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
    }, [index, listRef]);
}
