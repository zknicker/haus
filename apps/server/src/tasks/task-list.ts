import { isTaskShortId, type Task, type TaskDetail, type TaskGetInput, type TaskListInput } from '@haus/api';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, tasksTable } from '../postgres/schema.ts';
import { actorVisibleChats } from './actor-visible-chats.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import { readTaskDescriptionReferences } from './task-description-references.ts';
import { readTaskPlaceDetail } from './task-detail.ts';
import { TaskNotFoundError } from './task-errors.ts';
import { listTaskMentions, listTaskReminders } from './task-mentions.ts';
import { readTasks } from './task-read.ts';

type Reader = Pick<HausDatabase, 'select'>;

/** `task.list`: active Tasks, or archived ones, optionally of one Project. */
export async function listTasks(
    db: Reader,
    actor: TaskActor,
    input: TaskListInput & { createdBy?: TaskActor }
): Promise<Task[]> {
    await requireTaskActor(db, input.serverId, actor);
    return await readTasks(db, {
        serverId: input.serverId,
        viewer: actor,
        where: and(
            input.archived ? isNotNull(tasksTable.archivedAt) : isNull(tasksTable.archivedAt),
            input.projectId === undefined ? undefined : eq(tasksTable.projectId, input.projectId),
            input.createdBy === undefined ? undefined : createdByFilter(input.createdBy)
        ),
    });
}

/** `task.listActive`: every active Task the actor can see, for the sidebar. */
export async function listActiveTasks(
    db: Reader,
    actor: TaskActor,
    input: { serverId: string }
): Promise<Task[]> {
    await requireTaskActor(db, input.serverId, actor);
    return await readTasks(db, {
        serverId: input.serverId,
        viewer: actor,
        where: and(
            isNull(tasksTable.archivedAt),
            isNotNull(tasksTable.chatId),
            isNull(chatsTable.deletedAt),
            actorVisibleChats(actor)
        ),
    });
}

/** `task.get`: one Task by id or short id, with its Mentioned in and Reminders. */
export async function getTask(
    db: Reader,
    actor: TaskActor,
    input: TaskGetInput
): Promise<TaskDetail> {
    await requireTaskActor(db, input.serverId, actor);
    const task = await findTask(db, input, actor);
    const scope = { serverId: input.serverId, taskId: task.id };
    return {
        ...task,
        ...(await readTaskDescriptionReferences(db, {
            description: task.description,
            serverId: input.serverId,
        })),
        mentions: await listTaskMentions(db, actor, scope),
        reminders: await listTaskReminders(db, actor, scope),
        ...(await readTaskPlaceDetail(db, actor, task)),
    };
}

/** Resolves a Task by id or by its short id, as `viewer` may see it. */
export async function findTask(db: Reader, input: TaskGetInput, viewer?: TaskActor): Promise<Task> {
    const where =
        'taskId' in input ? eq(tasksTable.id, input.taskId) : eq(tasksTable.shortId, input.shortId);
    const [task] = await readTasks(db, {
        serverId: input.serverId,
        where,
        ...(viewer ? { viewer } : {}),
    });
    if (!task) {
        throw new TaskNotFoundError(
            'shortId' in input ? `No task has the short id ${input.shortId}.` : undefined
        );
    }
    return task;
}

/** Resolves what an Agent typed: a short id, else a full Task id. */
export async function findTaskByRef(db: Reader, input: { ref: string; serverId: string }) {
    const task = await readTaskByRef(db, input);
    if (!task) {
        throw new TaskNotFoundError(`No task is ${input.ref}.`);
    }
    return task;
}

export async function readTaskByRef(db: Reader, input: { ref: string; serverId: string }) {
    const [task] = await readTasks(db, {
        serverId: input.serverId,
        where: eq(isTaskShortId(input.ref) ? tasksTable.shortId : tasksTable.id, input.ref),
    });
    return task ?? null;
}

function createdByFilter(actor: TaskActor) {
    return actor.kind === 'agent'
        ? eq(tasksTable.createdByAgentId, actor.agentId)
        : eq(tasksTable.createdByUserId, actor.userId);
}
