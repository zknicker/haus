import { isClosedColumnCategory, type TaskMoveInput } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { boardColumnsTable, tasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import type { TaskWriteResult } from './task-assignment.ts';
import { requireTaskVersion, TaskInvariantError } from './task-errors.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';
import { clearTaskInboxItem, prepareTaskInboxChangedEvent } from './task-inbox-items.ts';
import { lockTask, readTask } from './task-read.ts';

/**
 * `task.move`, within the Task's own board. Entering a `done` or `canceled`
 * column sets `completedAt`; leaving one clears it; closed to closed keeps it.
 * The assignee moving their own Task clears their Task Inbox item. Moving to
 * the column the Task is already in changes nothing.
 */
export async function moveTask(
    db: HausDatabase,
    actor: TaskActor,
    input: TaskMoveInput
): Promise<TaskWriteResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireTaskActor(tx, input.serverId, actor);
        const current = await lockTask(tx, input.serverId, input.taskId);
        requireTaskVersion(current.version, input.expectedVersion);
        const [column] = await tx
            .select({ category: boardColumnsTable.category, id: boardColumnsTable.id })
            .from(boardColumnsTable)
            .where(
                and(
                    eq(boardColumnsTable.serverId, input.serverId),
                    eq(boardColumnsTable.boardId, current.boardId),
                    eq(boardColumnsTable.id, input.columnId)
                )
            )
            .limit(1);
        if (!column) {
            throw new TaskInvariantError('A task moves only to a column on its own board.');
        }
        if (column.id === current.columnId) {
            const task = await readTask(tx, input.serverId, current.id);
            return { assignmentChange: null, events: [], task, wakes: [] };
        }
        await tx
            .update(tasksTable)
            .set({
                columnId: column.id,
                completedAt: isClosedColumnCategory(column.category)
                    ? sql`coalesce(${tasksTable.completedAt}, now())`
                    : null,
                updatedAt: sql`now()`,
                version: sql`${tasksTable.version} + 1`,
            })
            .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.id, current.id)));
        const events: PreparedRealtimeEvent[] = [];
        if (actor.kind === 'user' && current.assigneeUserId === actor.userId) {
            const cleared = await clearTaskInboxItem(tx, {
                serverId: input.serverId,
                taskId: current.id,
                userId: actor.userId,
            });
            if (cleared) {
                events.push(
                    prepareTaskInboxChangedEvent({ serverId: input.serverId, userId: actor.userId })
                );
            }
        }
        const task = await readTask(tx, input.serverId, current.id);
        return {
            assignmentChange: null,
            events: [prepareTaskUpdatedEvent(task), ...events],
            task,
            wakes: [],
        };
    });
}
