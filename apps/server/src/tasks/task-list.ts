import {
    parseTaskKey,
    type Task,
    type TaskDetail,
    type TaskGetInput,
    type TaskListInput,
} from '@haus/api';
import { and, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, taskKeysTable, tasksTable } from '../postgres/schema.ts';
import { actorVisibleChats } from './actor-visible-chats.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import { readTaskDescriptionReferences } from './task-description-references.ts';
import { readTaskPlaceDetail } from './task-detail.ts';
import { TaskNotFoundError } from './task-errors.ts';
import { listTaskMentions, listTaskReminders } from './task-mentions.ts';
import { readTasks } from './task-read.ts';

type Reader = Pick<HausDatabase, 'select'>;

/** `task.list`: the Server's Tasks, filtered by assignee, state, and key-ledger entry. */
export async function listTasks(
    db: Reader,
    actor: TaskActor,
    input: TaskListInput
): Promise<Task[]> {
    await requireTaskActor(db, input.serverId, actor);
    return await readTasks(db, {
        serverId: input.serverId,
        where: and(
            assigneeFilter(input.assignee),
            input.states ? inArray(tasksTable.state, [...input.states]) : undefined,
            input.keyId === undefined ? undefined : eq(tasksTable.keyId, input.keyId)
        ),
    });
}

/**
 * `task.listOpen`, the sidebar (ADR 0053 decision 8): every `open` Task whose
 * origin Channel the actor can see. Todo, done, and canceled Tasks, and older
 * Tasks with no Chat of their own, are not listed.
 */
export async function listOpenTasks(
    db: Reader,
    actor: TaskActor,
    input: { serverId: string }
): Promise<Task[]> {
    await requireTaskActor(db, input.serverId, actor);
    return await readTasks(db, {
        serverId: input.serverId,
        where: and(
            eq(tasksTable.state, 'open'),
            isNotNull(tasksTable.chatId),
            isNull(chatsTable.deletedAt),
            actorVisibleChats(actor)
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
        ...(await readTaskDescriptionReferences(db, {
            description: task.description,
            serverId: input.serverId,
        })),
        mentions: await listTaskMentions(db, actor, scope),
        reminders: await listTaskReminders(db, actor, scope),
        ...(await readTaskPlaceDetail(db, actor, task)),
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
        where = and(eq(taskKeysTable.key, parsed.boardKey), eq(tasksTable.number, parsed.number));
    }
    const [task] = await readTasks(db, { serverId: input.serverId, where });
    if (!task) {
        throw new TaskNotFoundError(
            'key' in input ? `No task has the key ${input.key}.` : undefined
        );
    }
    return task;
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
