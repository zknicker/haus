import {
    parseTaskKey,
    type Task,
    type TaskDetail,
    type TaskGetInput,
    type TaskListInput,
} from '@haus/api';
import { and, count, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { boardColumnsTable, boardsTable, tasksTable } from '../postgres/schema.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import { TaskNotFoundError } from './task-errors.ts';
import { listTaskMentions, listTaskReminders } from './task-mentions.ts';
import { readTasks } from './task-read.ts';

type Reader = Pick<HausDatabase, 'select'>;

/**
 * `task.list`: the Server's Tasks, filtered by board, assignee, and column
 * category. Without a board, archived boards' Tasks stay out.
 */
export async function listTasks(
    db: Reader,
    actor: TaskActor,
    input: TaskListInput
): Promise<Task[]> {
    await requireTaskActor(db, input.serverId, actor);
    return await readTasks(db, {
        serverId: input.serverId,
        where: and(
            input.boardId === undefined
                ? isNull(boardsTable.archivedAt)
                : eq(tasksTable.boardId, input.boardId),
            assigneeFilter(input.assignee),
            input.categories ? inArray(boardColumnsTable.category, input.categories) : undefined
        ),
    });
}

/** `task.get`: one Task by id or key, with its Mentioned in and Reminders. */
export async function getTask(
    db: Reader,
    actor: TaskActor,
    input: TaskGetInput
): Promise<TaskDetail> {
    await requireTaskActor(db, input.serverId, actor);
    const task = await findTask(db, input);
    const scope = { serverId: input.serverId, taskId: task.id };
    return {
        ...task,
        mentions: await listTaskMentions(db, actor, scope),
        reminders: await listTaskReminders(db, actor, scope),
    };
}

/** Resolves a Task by id or by its current key (`SEC-12`). */
export async function findTask(db: Reader, input: TaskGetInput): Promise<Task> {
    let where: SQL | undefined;
    if ('taskId' in input) {
        where = eq(tasksTable.id, input.taskId);
    } else {
        const parsed = parseTaskKey(input.key);
        if (!parsed) {
            throw new TaskNotFoundError(`No task has the key ${input.key}.`);
        }
        where = and(eq(boardsTable.key, parsed.boardKey), eq(tasksTable.number, parsed.number));
    }
    const [task] = await readTasks(db, { serverId: input.serverId, where });
    if (!task) {
        throw new TaskNotFoundError(
            'key' in input ? `No task has the key ${input.key}.` : undefined
        );
    }
    return task;
}

/**
 * An Agent's open queue: how many Tasks assigned to it sit in `todo` and
 * `active` columns, on boards that are not archived. The move receipt names
 * what is still waiting (ADR 0051 decision 7).
 */
export async function countAgentTaskQueue(
    db: Reader,
    input: { agentId: string; serverId: string }
): Promise<{ active: number; todo: number }> {
    const rows = await db
        .select({ category: boardColumnsTable.category, tasks: count() })
        .from(tasksTable)
        .innerJoin(boardColumnsTable, eq(boardColumnsTable.id, tasksTable.columnId))
        .innerJoin(
            boardsTable,
            and(
                eq(boardsTable.serverId, tasksTable.serverId),
                eq(boardsTable.id, tasksTable.boardId)
            )
        )
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.assigneeAgentId, input.agentId),
                isNull(boardsTable.archivedAt),
                inArray(boardColumnsTable.category, ['todo', 'active'])
            )
        )
        .groupBy(boardColumnsTable.category);
    const byCategory = new Map(rows.map((row) => [row.category, row.tasks]));
    return { active: byCategory.get('active') ?? 0, todo: byCategory.get('todo') ?? 0 };
}

function assigneeFilter(assignee: TaskListInput['assignee']): SQL | undefined {
    if (assignee === undefined) {
        return;
    }
    if (assignee === 'none') {
        return and(isNull(tasksTable.assigneeUserId), isNull(tasksTable.assigneeAgentId));
    }
    return 'userId' in assignee
        ? eq(tasksTable.assigneeUserId, assignee.userId)
        : eq(tasksTable.assigneeAgentId, assignee.agentId);
}
