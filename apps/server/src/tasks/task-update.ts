import type { TaskUpdateInput } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import { requireTaskPlace, requireTaskVersion } from './task-errors.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { lockTask, readTask } from './task-read.ts';
import type { TaskWriteResult } from './task-write-result.ts';

/** `task.update`: title or description. */
export async function updateTask(
    db: HausDatabase,
    actor: TaskActor,
    input: TaskUpdateInput
): Promise<TaskWriteResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const current = await lockTask(tx, input.serverId, input.taskId);
        requireTaskVersion(current.version, input.expectedVersion);
        requireTaskPlace(current);
        const { description, title } = input.patch;
        await tx
            .update(tasksTable)
            .set({
                ...(title === undefined ? {} : { title }),
                ...(description === undefined ? {} : { description }),
                updatedAt: sql`now()`,
                version: sql`${tasksTable.version} + 1`,
            })
            .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.id, current.id)));
        const task = await readTask(tx, input.serverId, current.id);
        return { events: [prepareTaskUpdatedEvent(task)], task, wakes: [] };
    });
}
