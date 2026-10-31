import type { ChatMarkReadInput, ChatUnreadPreview } from '@haus/api';
import type { UnreadRow } from './unread-rows.ts';

/** How a row clears: its own Mark read, or the viewer replying from it. */
export type UnreadRowRead = 'mark-read' | 'reply';

/**
 * Which Unread row is open (ADR 0050). Exactly one is, whenever any row
 * exists: `id` names it, and `index` is where it sat, so when it leaves —
 * read here or anywhere else — the row that slid into its place opens.
 * `carryFocus` says the change came from inside the list, so focus follows
 * into the newly open row instead of falling to the page.
 */
export interface UnreadSelection {
    carryFocus: boolean;
    id: null | string;
    index: number;
}

export const initialUnreadSelection: UnreadSelection = { carryFocus: false, id: null, index: 0 };

/**
 * The open row: the selected one while it is still listed, otherwise the row
 * now at its index (the last row when the list got shorter), and null only
 * when nothing is unread.
 */
export function resolveOpenRow(
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

/** J and K: the row below or above the open one, stopping at either end. */
export function stepSelection(
    rows: readonly UnreadRow[],
    selection: UnreadSelection,
    step: -1 | 1,
    carryFocus: boolean
): UnreadSelection {
    const open = resolveOpenRow(rows, selection);
    if (!open) {
        return selection;
    }
    const index = Math.min(Math.max(open.index + step, 0), rows.length - 1);
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

/**
 * The `chat.markRead` that clears one Unread row, through the newest message
 * the row knows of. Mark read on a Channel or DM also reads every Thread under
 * it (ADR 0043), because that is what the row's action promises. A reply only
 * reads what the row showed, so a reply in a Channel leaves its Thread rows
 * alone. A Thread row reads the Thread's own Chat either way.
 *
 * Sending never moves the sender's read marker on the Server — a Chat's
 * unread rule only skips the viewer's own messages — so a reply from the row
 * reads the row itself; otherwise the row would stay with its question
 * answered (ADR 0050).
 */
export function unreadRowReadInput(
    row: UnreadRow,
    serverId: string,
    read: UnreadRowRead
): ChatMarkReadInput {
    if (row.kind === 'thread') {
        return {
            chatId: row.thread.threadChatId,
            sequence: row.thread.lastMessageSequence,
            serverId,
        };
    }
    return {
        chatId: row.chat.id,
        ...(read === 'mark-read' ? { includeThreads: true } : {}),
        sequence: row.chat.lastMessageSequence,
        serverId,
    };
}

/**
 * What an open row's "N earlier" does next. The row shows only the newest
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
