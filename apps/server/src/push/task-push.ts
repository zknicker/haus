import {
    type PushTaskAssignmentPayload,
    pushAlertBodyMaxLength,
    type TaskAssignedEvent,
    taskAssignmentNotificationTitle,
} from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { countUnreadInboxRows } from '../chats/unread-chat-count.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, taskInboxItemsTable, usersTable } from '../postgres/schema.ts';
import { taskAssignedTopic } from '../realtime/topics.ts';
import { readTask } from '../tasks/task-read.ts';
import { messagePreview } from './message-preview.ts';
import { sendToDevices } from './push-delivery.ts';
import { readPushableMembers } from './push-devices.ts';
import { clampName } from './push-payload.ts';
import type { PushQueue } from './push-queue.ts';
import type { PushSender } from './push-sender.ts';

interface TaskPushOptions {
    readGraceMs: number;
    signal: AbortSignal;
}

/**
 * iPhone push for Task assignments (ADR 0051): the post-commit `task.assigned`
 * fact, on the message push's queue and sender, with its read grace. The
 * assignment is already decided by the shared rule that published it. Resolves
 * when `signal` aborts.
 */
export async function listenForTaskPushes(
    db: HausDatabase,
    sender: PushSender,
    queue: PushQueue,
    options: TaskPushOptions
): Promise<void> {
    try {
        for await (const { event } of taskAssignedTopic.subscribe(options.signal)) {
            const queued = queue.enqueue(
                () =>
                    pushTaskAssignment(db, sender, event).catch((error: unknown) => {
                        console.warn(
                            '[haus] iPhone push failed for a Task assignment',
                            error instanceof Error ? error.name : 'unknown error'
                        );
                    }),
                options.readGraceMs
            );
            if (!queued) {
                console.warn('[haus] iPhone push backlog full; dropped a Task assignment push');
            }
        }
    } catch (error) {
        if (!options.signal.aborted) {
            console.error(
                '[haus] iPhone push stopped listening for Task assignments',
                error instanceof Error ? error.message : 'unknown error'
            );
        }
    }
}

/**
 * Pushes one assignment to the assignee's devices, unless it stopped being news
 * during the grace: the person opened the Task, or it went to someone else. The
 * version check also drops an assignment an immediate reassign superseded.
 */
export async function pushTaskAssignment(
    db: HausDatabase,
    sender: PushSender,
    event: TaskAssignedEvent
): Promise<void> {
    const { serverId, taskId, userId } = event;
    if ((await readPushableMembers(db, serverId, [userId])).length === 0) {
        return;
    }
    const [item] = await db
        .select({ assignmentVersion: taskInboxItemsTable.assignmentVersion })
        .from(taskInboxItemsTable)
        .where(
            and(
                eq(taskInboxItemsTable.serverId, serverId),
                eq(taskInboxItemsTable.userId, userId),
                eq(taskInboxItemsTable.taskId, taskId),
                isNull(taskInboxItemsTable.clearedAt)
            )
        )
        .limit(1);
    if (item?.assignmentVersion !== event.version) {
        return;
    }
    const assignerName = await readAssignerName(db, event);
    if (!assignerName) {
        console.warn('[haus] iPhone push skipped a Task assignment with no resolvable assigner');
        return;
    }
    const task = await readTask(db, serverId, taskId);
    const payload: PushTaskAssignmentPayload = {
        aps: {
            alert: {
                body: messagePreview(task.title, pushAlertBodyMaxLength),
                title: taskAssignmentNotificationTitle({ assignerName, key: task.key }),
            },
            badge: await countUnreadInboxRows(db, userId),
            sound: 'default',
            'thread-id': taskId,
        },
        key: task.key,
        kind: 'task_assignment',
        serverId,
        taskId,
    };
    await sendToDevices(db, sender, userId, {
        collapseId: `task-assign:${taskId}:${event.version}`,
        payload,
    });
}

async function readAssignerName(db: HausDatabase, event: TaskAssignedEvent) {
    const { assignedBy, serverId } = event;
    const [assigner] =
        assignedBy.kind === 'agent'
            ? await db
                  .select({ name: agentsTable.displayName })
                  .from(agentsTable)
                  .where(
                      and(
                          eq(agentsTable.serverId, serverId),
                          eq(agentsTable.id, assignedBy.agentId)
                      )
                  )
            : await db
                  .select({ name: usersTable.displayName })
                  .from(usersTable)
                  .where(eq(usersTable.id, assignedBy.userId));
    return assigner?.name ? clampName(assigner.name) : null;
}
