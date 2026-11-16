import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskInboxItemsTable } from '../postgres/schema.ts';
import { taskInboxChangedTopic } from '../realtime/topics.ts';
import type { TaskActor } from './task-actor.ts';

type InboxWriter = Pick<HausDatabase, 'delete' | 'insert' | 'update'>;

interface TaskInboxItemKey {
    serverId: string;
    taskId: string;
    userId: string;
}

/**
 * A person's Task Inbox item for one assignment (ADR 0051): one row per
 * (person, Task). Re-assigning the same person resets it to a fresh, uncleared
 * item stamped with the new assignment.
 */
export async function upsertTaskInboxItem(
    tx: InboxWriter,
    input: TaskInboxItemKey & { assignedBy: TaskActor; assignmentVersion: number }
): Promise<void> {
    const assigner =
        input.assignedBy.kind === 'user'
            ? { assignedByAgentId: null, assignedByUserId: input.assignedBy.userId }
            : { assignedByAgentId: input.assignedBy.agentId, assignedByUserId: null };
    await tx
        .insert(taskInboxItemsTable)
        .values({
            ...assigner,
            assignmentVersion: input.assignmentVersion,
            serverId: input.serverId,
            taskId: input.taskId,
            userId: input.userId,
        })
        .onConflictDoUpdate({
            set: {
                ...assigner,
                assignmentVersion: input.assignmentVersion,
                clearedAt: null,
                createdAt: sql`now()`,
            },
            target: [taskInboxItemsTable.userId, taskInboxItemsTable.taskId],
        });
}

/** Withdraws a person's item: the Task was reassigned away from them. */
export async function deleteTaskInboxItem(
    tx: InboxWriter,
    input: TaskInboxItemKey
): Promise<boolean> {
    const deleted = await tx
        .delete(taskInboxItemsTable)
        .where(itemWhere(input))
        .returning({ taskId: taskInboxItemsTable.taskId });
    return deleted.length > 0;
}

/** Clears an uncleared item; false when there is none or it was already cleared. */
export async function clearTaskInboxItem(
    tx: InboxWriter,
    input: TaskInboxItemKey
): Promise<boolean> {
    const cleared = await tx
        .update(taskInboxItemsTable)
        .set({ clearedAt: sql`now()` })
        .where(and(itemWhere(input), isNull(taskInboxItemsTable.clearedAt)))
        .returning({ taskId: taskInboxItemsTable.taskId });
    return cleared.length > 0;
}

/** Undoes a clear, for the App's Undo; false when the item is not cleared or is gone. */
export async function restoreTaskInboxItem(
    tx: InboxWriter,
    input: TaskInboxItemKey
): Promise<boolean> {
    const restored = await tx
        .update(taskInboxItemsTable)
        .set({ clearedAt: null })
        .where(and(itemWhere(input), isNotNull(taskInboxItemsTable.clearedAt)))
        .returning({ taskId: taskInboxItemsTable.taskId });
    return restored.length > 0;
}

/** `taskInbox.changed`, delivered only to the person whose items changed. */
export function prepareTaskInboxChangedEvent(input: { serverId: string; userId: string }) {
    return taskInboxChangedTopic.prepare(
        { serverId: input.serverId, userId: input.userId },
        { audienceUserId: input.userId }
    );
}

function itemWhere(input: TaskInboxItemKey) {
    return and(
        eq(taskInboxItemsTable.serverId, input.serverId),
        eq(taskInboxItemsTable.userId, input.userId),
        eq(taskInboxItemsTable.taskId, input.taskId)
    );
}
