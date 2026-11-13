import { type Board, type BoardListInput, openColumnCategories } from '@haus/api';
import { and, asc, count, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { boardColumnsTable, boardsTable, tasksTable } from '../postgres/schema.ts';
import { requireTaskActor, type TaskActor } from '../tasks/task-actor.ts';
import { BoardNotFoundError } from './board-errors.ts';

type BoardReader = Pick<HausDatabase, 'select'>;

/** `board.list`: the Server's boards in creation order, each with its columns and open count. */
export async function listBoards(
    db: BoardReader,
    actor: TaskActor,
    input: BoardListInput
): Promise<Board[]> {
    await requireTaskActor(db, input.serverId, actor);
    return await readBoards(db, {
        serverId: input.serverId,
        where: input.includeArchived ? undefined : isNull(boardsTable.archivedAt),
    });
}

/** One board as the contract shapes it; a missing board is `BoardNotFoundError`. */
export async function readBoard(
    db: BoardReader,
    serverId: string,
    boardId: string
): Promise<Board> {
    const [board] = await readBoards(db, { serverId, where: eq(boardsTable.id, boardId) });
    if (!board) {
        throw new BoardNotFoundError();
    }
    return board;
}

/** Locks one board row for a write: numbering, re-keying, and column edits serialize here. */
export async function lockBoard(
    tx: Pick<HausDatabase, 'select'>,
    serverId: string,
    boardId: string
) {
    const [board] = await tx
        .select({
            archivedAt: boardsTable.archivedAt,
            id: boardsTable.id,
            key: boardsTable.key,
            name: boardsTable.name,
            version: boardsTable.version,
        })
        .from(boardsTable)
        .where(and(eq(boardsTable.serverId, serverId), eq(boardsTable.id, boardId)))
        .for('update')
        .limit(1);
    if (!board) {
        throw new BoardNotFoundError();
    }
    return board;
}

async function readBoards(
    db: BoardReader,
    input: { serverId: string; where: SQL | undefined }
): Promise<Board[]> {
    const boards = await db
        .select()
        .from(boardsTable)
        .where(and(eq(boardsTable.serverId, input.serverId), input.where))
        .orderBy(asc(boardsTable.createdAt), asc(boardsTable.key));
    if (boards.length === 0) {
        return [];
    }
    const boardIds = boards.map((board) => board.id);
    const columns = await db
        .select()
        .from(boardColumnsTable)
        .where(
            and(
                eq(boardColumnsTable.serverId, input.serverId),
                inArray(boardColumnsTable.boardId, boardIds)
            )
        )
        .orderBy(asc(boardColumnsTable.position), asc(boardColumnsTable.createdAt));
    const openCounts = await db
        .select({ boardId: tasksTable.boardId, open: count() })
        .from(tasksTable)
        .innerJoin(boardColumnsTable, eq(boardColumnsTable.id, tasksTable.columnId))
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                inArray(tasksTable.boardId, boardIds),
                inArray(boardColumnsTable.category, [...openColumnCategories])
            )
        )
        .groupBy(tasksTable.boardId);
    const openByBoard = new Map(openCounts.map((row) => [row.boardId, row.open]));
    return boards.map((board) => ({
        archivedAt: board.archivedAt?.toISOString() ?? null,
        columns: columns
            .filter((column) => column.boardId === board.id)
            .map((column) => ({
                category: column.category,
                id: column.id,
                name: column.name,
                position: column.position,
            })),
        createdAt: board.createdAt.toISOString(),
        id: board.id,
        key: board.key,
        name: board.name,
        openTaskCount: openByBoard.get(board.id) ?? 0,
        serverId: board.serverId,
        updatedAt: board.updatedAt.toISOString(),
        version: board.version,
    }));
}
