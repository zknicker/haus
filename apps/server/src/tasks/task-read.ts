import { formatTaskKey, type Task } from '@haus/api';
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    boardColumnsTable,
    boardsTable,
    taskLabelAssignmentsTable,
    tasksTable,
} from '../postgres/schema.ts';
import { actorFromColumns, optionalActorFromColumns } from './task-actor.ts';
import { TaskNotFoundError } from './task-errors.ts';

type TaskReader = Pick<HausDatabase, 'select'>;

/**
 * Tasks on one Server matching `where`, oldest first, as the contract shapes
 * them: the key derived from the board's current key, the category from the
 * Task's column, and labels in label-id order.
 */
export async function readTasks(
    db: TaskReader,
    input: { serverId: string; where?: SQL }
): Promise<Task[]> {
    const rows = await db
        .select({
            boardKey: boardsTable.key,
            category: boardColumnsTable.category,
            task: tasksTable,
        })
        .from(tasksTable)
        .innerJoin(
            boardsTable,
            and(
                eq(boardsTable.serverId, tasksTable.serverId),
                eq(boardsTable.id, tasksTable.boardId)
            )
        )
        .innerJoin(boardColumnsTable, eq(boardColumnsTable.id, tasksTable.columnId))
        .where(and(eq(tasksTable.serverId, input.serverId), input.where))
        .orderBy(asc(tasksTable.createdAt), asc(tasksTable.number));
    const labels = await readTaskLabelIds(
        db,
        input.serverId,
        rows.map(({ task }) => task.id)
    );
    return rows.map(({ boardKey, category, task }) => ({
        assignee: optionalActorFromColumns(task.assigneeUserId, task.assigneeAgentId),
        boardId: task.boardId,
        category,
        columnId: task.columnId,
        completedAt: task.completedAt?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        createdBy: actorFromColumns(task.createdByUserId, task.createdByAgentId),
        description: task.description,
        dueOn: task.dueOn,
        id: task.id,
        key: formatTaskKey(boardKey, task.number),
        labelIds: labels.get(task.id) ?? [],
        number: task.number,
        priority: task.priority,
        serverId: task.serverId,
        title: task.title,
        updatedAt: task.updatedAt.toISOString(),
        version: task.version,
    }));
}

export async function readTask(db: TaskReader, serverId: string, taskId: string): Promise<Task> {
    const [task] = await readTasks(db, { serverId, where: eq(tasksTable.id, taskId) });
    if (!task) {
        throw new TaskNotFoundError();
    }
    return task;
}

/** Locks one Task row for a write; every mutation checks `expectedVersion` against it. */
export async function lockTask(tx: TaskReader, serverId: string, taskId: string) {
    const [task] = await tx
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, taskId)))
        .for('update')
        .limit(1);
    if (!task) {
        throw new TaskNotFoundError();
    }
    return task;
}

export type LockedTask = Awaited<ReturnType<typeof lockTask>>;

async function readTaskLabelIds(
    db: TaskReader,
    serverId: string,
    taskIds: string[]
): Promise<Map<string, string[]>> {
    if (taskIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({
            labelId: taskLabelAssignmentsTable.labelId,
            taskId: taskLabelAssignmentsTable.taskId,
        })
        .from(taskLabelAssignmentsTable)
        .where(
            and(
                eq(taskLabelAssignmentsTable.serverId, serverId),
                inArray(taskLabelAssignmentsTable.taskId, taskIds)
            )
        )
        .orderBy(asc(taskLabelAssignmentsTable.labelId));
    const byTask = new Map<string, string[]>();
    for (const row of rows) {
        byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row.labelId]);
    }
    return byTask;
}
