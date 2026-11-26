import type { Task, TaskActivity } from '@haus/api';
import { and, asc, eq, inArray, not, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, tasksTable } from '../postgres/schema.ts';
import { actorVisibleChats } from './actor-visible-chats.ts';
import { taskActivitySql, taskNeedsYouSql } from './task-activity.ts';
import { actorFromColumns, type TaskActor } from './task-actor.ts';
import { TaskNotFoundError } from './task-errors.ts';

type TaskReader = Pick<HausDatabase, 'select'>;

/**
 * Tasks on one Server matching `where`, oldest first, as the contract shapes
 * them. With a `viewer`, a DM origin shows only to a reader of that DM
 * (specs/tasks.md, "The Task target").
 */
export async function readTasks(
    db: TaskReader,
    input: { serverId: string; viewer?: TaskActor; where?: SQL }
): Promise<Task[]> {
    const rows = await db
        .select({ activity: taskActivitySql, needsYou: taskNeedsYouSql, task: tasksTable })
        .from(tasksTable)
        .leftJoin(
            chatsTable,
            and(eq(chatsTable.serverId, tasksTable.serverId), eq(chatsTable.id, tasksTable.chatId))
        )
        .where(and(eq(tasksTable.serverId, input.serverId), input.where))
        .orderBy(asc(tasksTable.createdAt), asc(tasksTable.id));
    const tasks = rows.map(({ activity, needsYou, task }) => toTask(task, activity, needsYou));
    return input.viewer ? await withVisibleOrigins(db, input.viewer, tasks) : tasks;
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

/** Clears each DM origin `viewer` cannot read; a Channel origin shows to everyone. */
export async function withVisibleOrigins(
    db: TaskReader,
    viewer: TaskActor,
    tasks: Task[]
): Promise<Task[]> {
    const serverId = tasks[0]?.serverId;
    const originChatIds = [
        ...new Set(tasks.flatMap(({ origin }) => (origin ? [origin.chatId] : []))),
    ];
    if (!serverId || originChatIds.length === 0) {
        return tasks;
    }
    const hidden = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                inArray(chatsTable.id, originChatIds),
                eq(chatsTable.kind, 'dm'),
                not(actorVisibleChats(viewer))
            )
        );
    const hiddenIds = new Set(hidden.map(({ id }) => id));
    return tasks.map((task) =>
        task.origin && hiddenIds.has(task.origin.chatId) ? { ...task, origin: null } : task
    );
}

function toTask(task: typeof tasksTable.$inferSelect, activity: TaskActivity, needsYou: boolean) {
    return {
        activity,
        agentId: task.agentId,
        archivedAt: task.archivedAt?.toISOString() ?? null,
        captainId: task.captainId,
        chatId: task.chatId,
        computerId: task.computerId,
        createdAt: task.createdAt.toISOString(),
        createdBy: actorFromColumns(task.createdByUserId, task.createdByAgentId),
        description: task.description,
        id: task.id,
        model: task.model,
        needsYou,
        origin:
            task.originChatId && task.originMessageId
                ? { chatId: task.originChatId, messageId: task.originMessageId }
                : null,
        projectId: task.projectId,
        serverId: task.serverId,
        shortId: task.shortId,
        title: task.title,
        titleCustom: task.titleCustom,
        updatedAt: task.updatedAt.toISOString(),
        version: task.version,
    };
}
