import type { TaskArchiveInput } from '@haus/api';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { closeTaskWorkers } from '../workers/close-task-workers.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import { cancelTaskReminders } from './task-close-reminders.ts';
import { requireTaskPlace, requireTaskVersion } from './task-errors.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { lockTask, readTask } from './task-read.ts';
import type { TaskWriteResult } from './task-write-result.ts';

/**
 * `task.archive`: sets `archived_at`, cancels the Task's pending reminders, and
 * closes its Workers. Archiving an archived Task changes nothing.
 */
export async function archiveTask(
    db: HausDatabase,
    actor: TaskActor,
    agentDelivery: AgentDelivery,
    input: TaskArchiveInput
): Promise<TaskWriteResult> {
    return await db.transaction(async (tx) => {
        const current = await lockForArchive(tx, actor, input);
        if (current.archivedAt !== null) {
            return { events: [], task: await readTask(tx, input.serverId, current.id), wakes: [] };
        }
        requireTaskPlace(current);
        await setArchivedAt(tx, input, sql`now()`);
        const reminderEvents = await cancelTaskReminders(tx, {
            chatId: current.chatId,
            serverId: input.serverId,
        });
        const workers = await closeTaskWorkers(tx, agentDelivery, {
            actor,
            serverId: input.serverId,
            taskChatId: current.chatId,
            taskId: current.id,
        });
        const task = await readTask(tx, input.serverId, current.id);
        return {
            events: [prepareTaskUpdatedEvent(task), ...reminderEvents, ...workers.events],
            task,
            wakes: workers.wakes,
            workerFrames: workers.frames,
        };
    });
}

/** `task.unarchive`: clears `archived_at`. Canceled reminders stay canceled. */
export async function unarchiveTask(
    db: HausDatabase,
    actor: TaskActor,
    input: TaskArchiveInput
): Promise<TaskWriteResult> {
    return await db.transaction(async (tx) => {
        const current = await lockForArchive(tx, actor, input);
        if (current.archivedAt === null) {
            return { events: [], task: await readTask(tx, input.serverId, current.id), wakes: [] };
        }
        requireTaskPlace(current);
        await setArchivedAt(tx, input, null);
        const task = await readTask(tx, input.serverId, current.id);
        return { events: [prepareTaskUpdatedEvent(task)], task, wakes: [] };
    });
}

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

async function lockForArchive(tx: Tx, actor: TaskActor, input: TaskArchiveInput) {
    await lockServerRow(tx, input.serverId);
    await requireTaskActor(tx, input.serverId, actor);
    const current = await lockTask(tx, input.serverId, input.taskId);
    requireTaskVersion(current.version, input.expectedVersion);
    return current;
}

async function setArchivedAt(
    tx: Tx,
    input: TaskArchiveInput,
    archivedAt: SQL | null
) {
    await tx
        .update(tasksTable)
        .set({ archivedAt, updatedAt: sql`now()`, version: sql`${tasksTable.version} + 1` })
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.id, input.taskId)));
}
