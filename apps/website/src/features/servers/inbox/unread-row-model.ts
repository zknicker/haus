import type { ChatMarkReadInput, ChatUnreadPreview } from '@haus/api';
import type { UnreadRow } from './unread-rows.ts';

/**
 * Which Unread card is selected (ADR 0050). Exactly one is, whenever any
 * card exists: `id` names it, and `index` is where it sat, so when it leaves
 * — read here or anywhere else — the card that slid into its place is
 * selected. `carryFocus` says the change came from inside the list, so focus
 * follows onto the newly selected card instead of falling to the page.
 */
export interface UnreadSelection {
    carryFocus: boolean;
    id: null | string;
    index: number;
}

export const initialUnreadSelection: UnreadSelection = { carryFocus: false, id: null, index: 0 };

/**
 * The selected row: the one the selection names while it is still listed,
 * otherwise the row now at its index (the last row when the list got
 * shorter), and null only when nothing is unread.
 */
export function resolveSelectedRow(
    rows: readonly UnreadRow[],
    selection: UnreadSelection
): { index: number; row: UnreadRow } | null {
    if (rows.length === 0) {
        return null;
    }
    const found = selection.id === null ? -1 : rows.findIndex((row) => row.id === selection.id);
    const index = found >= 0 ? found : Math.min(selection.index, rows.length - 1);
    const row = rows[index];
    return row ? { index, row } : null;
}

/** J and K: the row below or above the selected one, stopping at either end. */
export function stepSelection(
    rows: readonly UnreadRow[],
    selection: UnreadSelection,
    step: -1 | 1,
    carryFocus: boolean
): UnreadSelection {
    const selected = resolveSelectedRow(rows, selection);
    if (!selected) {
        return selection;
    }
    const index = Math.min(Math.max(selected.index + step, 0), rows.length - 1);
    return { carryFocus, id: rows[index]?.id ?? null, index };
}

/**
 * The selection once `rowId` is read and leaves: the row after it, or the one
 * before it when it was last. Mark read and a reply both advance this way, so
 * the list is a queue worked from the top down.
 */
export function selectionAfterLeaving(
    rows: readonly UnreadRow[],
    rowId: string,
    carryFocus: boolean
): UnreadSelection {
    const index = rows.findIndex((row) => row.id === rowId);
    if (index < 0) {
        return { carryFocus, id: null, index: 0 };
    }
    const next = rows[index + 1] ?? rows[index - 1] ?? null;
    // After the row leaves, the next one slides into its index.
    return { carryFocus, id: next?.id ?? null, index: rows[index + 1] ? index : index - 1 };
}

export function unreadRowReadInput(row: UnreadRow, serverId: string): ChatMarkReadInput {
    if (row.kind === 'task-chat') {
        return {
            chatId: row.preview.chatId,
            sequence: row.preview.messages.at(-1)?.sequence ?? 0,
            serverId,
        };
    }
    return { chatId: row.chat.id, sequence: row.chat.lastMessageSequence, serverId };
}

/**
 * What a card's "N earlier" does next. The card shows only the newest
 * waiting message; the first press reveals the rest the preview carries, in
 * place, and once those show, the counted messages older still open the
 * conversation at the first of them. Null when nothing earlier is waiting.
 */
export function earlierUnread(
    preview: Pick<ChatUnreadPreview, 'earlierUnreadCount' | 'messages'>,
    revealed: boolean
): { action: 'open' | 'reveal'; label: string } | null {
    const hidden = revealed ? 0 : Math.max(preview.messages.length - 1, 0);
    const count = hidden + preview.earlierUnreadCount;
    if (count === 0) {
        return null;
    }
    return { action: hidden > 0 ? 'reveal' : 'open', label: `${count} earlier` };
}
