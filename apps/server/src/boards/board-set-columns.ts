import {
    type Board,
    type BoardSetColumnsInput,
    closedColumnCategories,
    isClosedColumnCategory,
} from '@haus/api';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { boardColumnsTable, boardsTable, tasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskActor, type TaskActor } from '../tasks/task-actor.ts';
import { prepareTaskUpdatedEvent } from '../tasks/task-events.ts';
import { prepareBoardEvent } from './board-events.ts';
import { lockBoard, readBoard } from './board-read.ts';
import { requireBoardVersion } from './board-update.ts';
import { planBoardColumns } from './column-plan.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

/**
 * `board.setColumns`: replace the board's whole ordered column list in one
 * transaction. Tasks in removed columns move per `moveTasks`; any Task whose
 * column now sits in a different open/closed category gains or loses
 * `completedAt`, so a Task record never disagrees with its column.
 */
export async function setBoardColumns(
    db: HausDatabase,
    actor: TaskActor,
    input: BoardSetColumnsInput
): Promise<{ board: Board; events: PreparedRealtimeEvent[] }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const current = await lockBoard(tx, input.serverId, input.boardId);
        requireBoardVersion(current.version, input.expectedVersion);
        const scope = { boardId: input.boardId, serverId: input.serverId };
        const existing = await tx
            .select({
                category: boardColumnsTable.category,
                id: boardColumnsTable.id,
                name: boardColumnsTable.name,
            })
            .from(boardColumnsTable)
            .where(boardColumnsScope(scope))
            .orderBy(asc(boardColumnsTable.position));
        const counts = await tx
            .select({ columnId: tasksTable.columnId, tasks: count() })
            .from(tasksTable)
            .where(
                and(eq(tasksTable.serverId, scope.serverId), eq(tasksTable.boardId, scope.boardId))
            )
            .groupBy(tasksTable.columnId);
        const plan = planBoardColumns({
            drafts: input.columns,
            existing,
            moveTasks: input.moveTasks ?? {},
            taskCounts: new Map(counts.map((row) => [row.columnId, row.tasks])),
        });

        for (const column of plan.kept) {
            await tx
                .update(boardColumnsTable)
                .set({ category: column.category, name: column.name, position: column.position })
                .where(and(boardColumnsScope(scope), eq(boardColumnsTable.id, column.id)));
        }
        if (plan.created.length > 0) {
            await tx.insert(boardColumnsTable).values(
                plan.created.map((column) => ({
                    ...column,
                    boardId: scope.boardId,
                    id: createOpaqueId('col'),
                    serverId: scope.serverId,
                }))
            );
        }
        const changed: { id: string; version: number }[] = [];
        for (const move of plan.moves) {
            changed.push(...(await moveColumnTasks(tx, scope, move, plan)));
        }
        changed.push(...(await reconcileCompletedAt(tx, scope)));
        if (plan.removed.length > 0) {
            await tx
                .delete(boardColumnsTable)
                .where(and(boardColumnsScope(scope), inArray(boardColumnsTable.id, plan.removed)));
        }
        await tx
            .update(boardsTable)
            .set({ updatedAt: sql`now()`, version: sql`${boardsTable.version} + 1` })
            .where(and(eq(boardsTable.serverId, scope.serverId), eq(boardsTable.id, current.id)));

        const board = await readBoard(tx, scope.serverId, scope.boardId);
        return {
            board,
            events: [
                prepareBoardEvent(board),
                ...changed.map((task) =>
                    prepareTaskUpdatedEvent({ ...scope, id: task.id, version: task.version })
                ),
            ],
        };
    });
}

async function moveColumnTasks(
    tx: Tx,
    scope: { boardId: string; serverId: string },
    move: { from: string; to: string },
    plan: ReturnType<typeof planBoardColumns>
) {
    const target = plan.kept.find((column) => column.id === move.to);
    if (!target) {
        throw new Error(`Planned move target ${move.to} is not a kept column.`);
    }
    return await tx
        .update(tasksTable)
        .set({
            columnId: move.to,
            completedAt: isClosedColumnCategory(target.category)
                ? sql`coalesce(${tasksTable.completedAt}, now())`
                : null,
            updatedAt: sql`now()`,
            version: sql`${tasksTable.version} + 1`,
        })
        .where(
            and(
                eq(tasksTable.serverId, scope.serverId),
                eq(tasksTable.boardId, scope.boardId),
                eq(tasksTable.columnId, move.from)
            )
        )
        .returning({ id: tasksTable.id, version: tasksTable.version });
}

/** Tasks whose kept column changed between open and closed categories. */
async function reconcileCompletedAt(tx: Tx, scope: { boardId: string; serverId: string }) {
    const closed = sql`(
        select ${boardColumnsTable.category} in ${[...closedColumnCategories]}
        from ${boardColumnsTable}
        where ${boardColumnsTable.id} = ${tasksTable.columnId}
    )`;
    return await tx
        .update(tasksTable)
        .set({
            completedAt: sql`case when ${closed} then now() else null end`,
            updatedAt: sql`now()`,
            version: sql`${tasksTable.version} + 1`,
        })
        .where(
            and(
                eq(tasksTable.serverId, scope.serverId),
                eq(tasksTable.boardId, scope.boardId),
                sql`${closed} <> (${tasksTable.completedAt} is not null)`
            )
        )
        .returning({ id: tasksTable.id, version: tasksTable.version });
}

function boardColumnsScope(scope: { boardId: string; serverId: string }) {
    return and(
        eq(boardColumnsTable.serverId, scope.serverId),
        eq(boardColumnsTable.boardId, scope.boardId)
    );
}
