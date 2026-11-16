import { type Board, type BoardUpdateInput, GENERAL_BOARD_KEY } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { boardsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskActor, type TaskActor } from '../tasks/task-actor.ts';
import { toBoardKeyConflict } from './board-create.ts';
import { BoardConflictError, BoardInvariantError } from './board-errors.ts';
import { prepareBoardEvent } from './board-events.ts';
import { lockBoard, readBoard } from './board-read.ts';

/**
 * `board.update`: rename, re-key, archive, or restore. Re-keying re-keys every
 * Task on the board, since keys are derived when read. The General board keeps
 * its `GEN` key and is never archived: every Server always has it.
 */
export async function updateBoard(
    db: HausDatabase,
    actor: TaskActor,
    input: BoardUpdateInput
): Promise<{ board: Board; event: PreparedRealtimeEvent }> {
    try {
        return await db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await requireTaskActor(tx, input.serverId, actor);
            const current = await lockBoard(tx, input.serverId, input.boardId);
            requireBoardVersion(current.version, input.expectedVersion);
            const { archived, key, name } = input.patch;
            if (
                current.key === GENERAL_BOARD_KEY &&
                (archived === true || (key && key !== current.key))
            ) {
                throw new BoardInvariantError(
                    'The General board keeps its GEN key and stays active.'
                );
            }
            await tx
                .update(boardsTable)
                .set({
                    ...(name === undefined ? {} : { name }),
                    ...(key === undefined ? {} : { key }),
                    ...(archived === undefined
                        ? {}
                        : { archivedAt: archived ? (current.archivedAt ?? sql`now()`) : null }),
                    updatedAt: sql`now()`,
                    version: sql`${boardsTable.version} + 1`,
                })
                .where(
                    and(eq(boardsTable.serverId, input.serverId), eq(boardsTable.id, input.boardId))
                );
            const board = await readBoard(tx, input.serverId, input.boardId);
            return { board, event: prepareBoardEvent(board) };
        });
    } catch (cause) {
        throw toBoardKeyConflict(cause, input.patch.key);
    }
}

export function requireBoardVersion(current: number, expected: number): void {
    if (current !== expected) {
        throw new BoardConflictError(
            `The board changed (version ${current}, expected ${expected}). Reload and retry.`
        );
    }
}
