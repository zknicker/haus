import type { TaskAssignInput } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    optionalActorFromColumns,
    requireTaskActor,
    sameTaskActor,
    type TaskActor,
} from './task-actor.ts';
import {
    applyTaskAssignmentChange,
    type TaskAgentDelivery,
    type TaskWriteResult,
} from './task-assignment.ts';
import { requireTaskVersion } from './task-errors.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { assigneeColumns, requireTaskAssignee } from './task-fields.ts';
import { lockTask, readTask } from './task-read.ts';

/**
 * `task.assign`: set or clear the one assignee. The change and its effects
 * (`applyTaskAssignmentChange`) commit together. Assigning the current
 * assignee again changes nothing.
 */
export async function assignTask(
    db: HausDatabase,
    actor: TaskActor,
    agentDelivery: TaskAgentDelivery,
    input: TaskAssignInput
): Promise<TaskWriteResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const current = await lockTask(tx, input.serverId, input.taskId);
        requireTaskVersion(current.version, input.expectedVersion);
        const previous = optionalActorFromColumns(current.assigneeUserId, current.assigneeAgentId);
        if (sameTaskActor(previous, input.assignee)) {
            const task = await readTask(tx, input.serverId, current.id);
            return { assignmentChange: null, events: [], task, wakes: [] };
        }
        if (input.assignee) {
            await requireTaskAssignee(tx, input.serverId, input.assignee);
        }
        await tx
            .update(tasksTable)
            .set({
                ...assigneeColumns(input.assignee),
                updatedAt: sql`now()`,
                version: sql`${tasksTable.version} + 1`,
            })
            .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.id, current.id)));
        const task = await readTask(tx, input.serverId, current.id);
        const assignmentChange = { actor, next: input.assignee, previous, task };
        const effects = await applyTaskAssignmentChange(tx, agentDelivery, assignmentChange);
        return {
            assignmentChange,
            events: [prepareTaskUpdatedEvent(task), ...effects.events],
            task,
            wakes: effects.wakes,
        };
    });
}
