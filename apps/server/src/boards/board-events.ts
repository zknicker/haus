import { boardUpdatedTopic } from '../realtime/topics.ts';

/**
 * Prepares `board.updated` for a board change about to commit: created,
 * renamed, re-keyed, archived, or columns set. Ids and version only; members
 * refetch `board.list` and that board's Task reads.
 */
export function prepareBoardEvent(board: { id: string; serverId: string; version: number }) {
    return boardUpdatedTopic.prepare({
        boardId: board.id,
        serverId: board.serverId,
        version: board.version,
    });
}
