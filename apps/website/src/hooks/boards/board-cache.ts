import type { Board, BoardColumn } from '@haus/api';

/**
 * A board mutation's ack in the cached `board.list`: the authoritative board
 * replaces the cached one or joins the end, unless a newer read already
 * landed, and an archived board leaves. A page can then read the board it just
 * made, and a next edit sends the version it just got.
 */
export function putBoard(boards: Board[] | undefined, board: Board): Board[] | undefined {
    if (!boards) {
        return boards;
    }
    const current = boards.find((item) => item.id === board.id);
    if (current && current.version > board.version) {
        return boards;
    }
    if (board.archivedAt !== null) {
        return boards.filter((item) => item.id !== board.id);
    }
    return current
        ? boards.map((item) => (item.id === board.id ? board : item))
        : [...boards, board];
}

/** One column by id, across the Server's boards. */
export function findBoardColumn(
    boards: Board[] | undefined,
    columnId: string
): BoardColumn | undefined {
    return boards?.flatMap((board) => board.columns).find((column) => column.id === columnId);
}
