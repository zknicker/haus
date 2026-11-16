import {
    type Board,
    type BoardCreateInput,
    defaultBoardColumns,
    GENERAL_BOARD_KEY,
    GENERAL_BOARD_NAME,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { boardColumnsTable, boardsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { creatorColumns, requireTaskActor, type TaskActor } from '../tasks/task-actor.ts';
import { BoardConflictError } from './board-errors.ts';
import { prepareBoardEvent } from './board-events.ts';
import { readBoard } from './board-read.ts';

type BoardWriter = Pick<HausDatabase, 'insert'>;

/** `board.create`: a new board with the default columns. Keys are unique per Server. */
export async function createBoard(
    db: HausDatabase,
    actor: TaskActor,
    input: BoardCreateInput
): Promise<{ board: Board; event: PreparedRealtimeEvent }> {
    try {
        return await db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await requireTaskActor(tx, input.serverId, actor);
            const boardId = await insertBoard(tx, {
                createdBy: actor,
                key: input.key,
                name: input.name,
                serverId: input.serverId,
            });
            const board = await readBoard(tx, input.serverId, boardId);
            return { board, event: prepareBoardEvent(board) };
        });
    } catch (cause) {
        throw toBoardKeyConflict(cause, input.key);
    }
}

/**
 * The Server's always-present General board. Server creation and the dev seed
 * call this inside the transaction that creates the Server.
 */
export async function insertGeneralBoard(tx: BoardWriter, serverId: string): Promise<string> {
    return await insertBoard(tx, {
        createdBy: null,
        key: GENERAL_BOARD_KEY,
        name: GENERAL_BOARD_NAME,
        serverId,
    });
}

/** Maps the per-Server key uniqueness violation to a typed conflict. */
export function toBoardKeyConflict(cause: unknown, key: string | undefined): unknown {
    if (violatesConstraint(cause, 'boards_server_key_key')) {
        return new BoardConflictError(`Another board on this Server already uses the key ${key}.`);
    }
    return cause;
}

async function insertBoard(
    tx: BoardWriter,
    input: { createdBy: TaskActor | null; key: string; name: string; serverId: string }
): Promise<string> {
    const boardId = createOpaqueId('brd');
    await tx.insert(boardsTable).values({
        ...(input.createdBy ? creatorColumns(input.createdBy) : {}),
        id: boardId,
        key: input.key,
        name: input.name,
        serverId: input.serverId,
    });
    await tx.insert(boardColumnsTable).values(
        defaultBoardColumns.map((column, position) => ({
            boardId,
            category: column.category,
            id: createOpaqueId('col'),
            name: column.name,
            position,
            serverId: input.serverId,
        }))
    );
    return boardId;
}
