import type { TaskArchiveInput } from '@haus/api';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { handBackArchivedTaskIssues } from '../issues/issue-handback.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { closeTaskWorkers } from '../workers/close-task-workers.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import { cancelTaskReminders } from './task-close-reminders.ts';
import {
    requireTaskPlace,
    requireTaskVersion,
    TaskInvariantError,
    TaskProjectArchivedError,
} from './task-errors.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { type LockedTask, lockTask, readTask } from './task-read.ts';
import { rotateTaskSession } from './task-session.ts';
import type { TaskWriteResult } from './task-write-result.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export async function archiveTask(
    db: HausDatabase,
    actor: TaskActor,
    agentDelivery: AgentDelivery,
    input: TaskArchiveInput
) {
    return await db.transaction(async (tx) => {
        const current = await lockForArchive(tx, actor, input);
        return await archiveLockedTask(tx, actor, agentDelivery, current);
    });
}

export async function archiveLockedTask(
    tx: Tx,
    actor: TaskActor,
    agentDelivery: AgentDelivery,
    current: LockedTask
) {
    const { serverId } = current;
    if (current.archivedAt !== null) {
        const unchanged: TaskWriteResult = {
            events: [],
            task: await readTask(tx, serverId, current.id),
            wakes: [],
        };
        return unchanged;
    }
    requireTaskPlace(current);
    await setArchivedAt(tx, current, sql`now()`);
    const reminderEvents = await cancelTaskReminders(tx, { chatId: current.chatId, serverId });
    const workers = await closeTaskWorkers(tx, agentDelivery, {
        actor,
        serverId,
        taskChatId: current.chatId,
        taskId: current.id,
    });
    const issues = await handBackArchivedTaskIssues(tx, { actor, serverId, taskId: current.id });
    const sessions = current.agentId
        ? [
              await rotateTaskSession(tx, {
                  agentId: current.agentId,
                  archived: true,
                  chatId: current.chatId,
                  serverId,
              }),
          ]
        : [];
    const task = await readTask(tx, serverId, current.id);
    const result: TaskWriteResult = {
        events: [
            prepareTaskUpdatedEvent(task),
            ...reminderEvents,
            ...workers.events,
            ...issues.events,
        ],
        sessions,
        task,
        wakes: [...workers.wakes, ...issues.agentWakes],
        workerFrames: workers.frames,
    };
    return result;
}

export async function unarchiveTask(db: HausDatabase, actor: TaskActor, input: TaskArchiveInput) {
    return await db.transaction(async (tx) => {
        const current = await lockForArchive(tx, actor, input);
        if (current.archivedAt === null) {
            const unchanged: TaskWriteResult = {
                events: [],
                task: await readTask(tx, input.serverId, current.id),
                wakes: [],
            };
            return unchanged;
        }
        requireTaskPlace(current);
        await requireProjectActive(tx, current);
        if (current.agentId && !current.computerId) {
            throw new TaskInvariantError(
                'This Task’s Machine was removed, so it stays archived. Start a new Task instead.'
            );
        }
        await setArchivedAt(tx, current, null);
        const sessions = current.agentId
            ? [
                  await rotateTaskSession(tx, {
                      agentId: current.agentId,
                      archived: false,
                      chatId: current.chatId,
                      serverId: current.serverId,
                  }),
              ]
            : [];
        const task = await readTask(tx, input.serverId, current.id);
        const result: TaskWriteResult = {
            events: [prepareTaskUpdatedEvent(task)],
            sessions,
            task,
            wakes: [],
        };
        return result;
    });
}

async function lockForArchive(tx: Tx, actor: TaskActor, input: TaskArchiveInput) {
    await lockServerRow(tx, input.serverId);
    await requireTaskActor(tx, input.serverId, actor);
    const current = await lockTask(tx, input.serverId, input.taskId);
    requireTaskVersion(current.version, input.expectedVersion);
    return current;
}

async function requireProjectActive(tx: Tx, task: LockedTask) {
    const [project] = await tx
        .select({ archivedAt: chatsTable.archivedAt })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, task.serverId), eq(chatsTable.id, task.projectId)))
        .limit(1);
    if (project?.archivedAt) {
        throw new TaskProjectArchivedError();
    }
}

async function setArchivedAt(
    tx: Tx,
    task: { id: string; serverId: string },
    archivedAt: SQL | null
) {
    await tx
        .update(tasksTable)
        .set({ archivedAt, updatedAt: sql`now()`, version: sql`${tasksTable.version} + 1` })
        .where(and(eq(tasksTable.serverId, task.serverId), eq(tasksTable.id, task.id)));
}
