import { isClosedTaskState, type TaskSetStateInput } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import type { TaskWriteResult } from './task-assignment.ts';
import { cancelTaskReminders } from './task-close-reminders.ts';
import { requireTaskPlace, requireTaskVersion } from './task-errors.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { lockTask, readTask } from './task-read.ts';

/**
 * `task.setState` and the Agent's `tasks/state` (ADR 0053 decisions 2 and 13).
 * `tasks.state` is the truth, and `completedAt` is set exactly while the Task
 * is closed. A chatless Task from before Tasks were places is read-only
 * history and refuses the change. Closing cancels
 * the Task's pending one-time reminders. Setting the current state again
 * changes nothing.
 */
export async function setTaskState(
    db: HausDatabase,
    actor: TaskActor,
    input: TaskSetStateInput
): Promise<TaskWriteResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const current = await lockTask(tx, input.serverId, input.taskId);
        requireTaskVersion(current.version, input.expectedVersion);
        const unchanged = { assignmentChange: null, events: [], wakes: [] };
        if (current.state === input.state) {
            return { ...unchanged, task: await readTask(tx, input.serverId, current.id) };
        }
        requireTaskPlace(current);
        const closing = isClosedTaskState(input.state);
        await tx
            .update(tasksTable)
            .set({
                completedAt: closing ? sql`coalesce(${tasksTable.completedAt}, now())` : null,
                state: input.state,
                updatedAt: sql`now()`,
                version: sql`${tasksTable.version} + 1`,
            })
            .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.id, current.id)));
        const reminderEvents = closing
            ? await cancelTaskReminders(tx, { chatId: current.chatId, serverId: input.serverId })
            : [];
        const task = await readTask(tx, input.serverId, current.id);
        return {
            ...unchanged,
            events: [prepareTaskUpdatedEvent(task), ...reminderEvents],
            task,
        };
    });
}
