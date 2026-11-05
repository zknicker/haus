import {
    type PushTaskAssignmentBurstPayload,
    type PushTaskAssignmentPayload,
    pushAlertBodyMaxLength,
    type TaskActor,
    type TaskAssignedEvent,
    taskAssignmentBurstNotificationBody,
    taskAssignmentBurstNotificationTitle,
    taskAssignmentNotificationTitle,
} from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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

/** The newest Task's title in a burst's body, leaving room for " and 999 more". */
const burstBodyTitleMaxLength = pushAlertBodyMaxLength - 16;

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
    const window = createTaskPushWindow(queue, options.readGraceMs, (events) =>
        pushTaskAssignments(db, sender, events).catch((error: unknown) => {
            console.warn(
                '[haus] iPhone push failed for a Task assignment',
                error instanceof Error ? error.name : 'unknown error'
            );
        })
    );
    try {
        for await (const { event } of taskAssignedTopic.subscribe(options.signal)) {
            window.add(event);
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
 * Holds one person's assignments for the read grace: the first opens the window
 * and the rest of the grace joins it, so an Agent filing a queue is one send.
 * The window never extends, so a steady stream of assignments still pushes.
 */
export function createTaskPushWindow(
    queue: PushQueue,
    readGraceMs: number,
    send: (events: readonly TaskAssignedEvent[]) => Promise<void>
) {
    const open = new Map<string, TaskAssignedEvent[]>();

    return {
        add(event: TaskAssignedEvent) {
            const windowKey = `${event.serverId}:${event.userId}`;
            const joined = open.get(windowKey);
            if (joined) {
                joined.push(event);
                return;
            }
            const events = [event];
            open.set(windowKey, events);
            const queued = queue.enqueue(() => {
                open.delete(windowKey);
                return send(events);
            }, readGraceMs);
            if (!queued) {
                open.delete(windowKey);
                console.warn('[haus] iPhone push backlog full; dropped a Task assignment push');
            }
        },
    };
}

/**
 * Pushes one person's assignments from one window to their devices, less any
 * that stopped being news during the grace: the person opened the Task, or it
 * went to someone else. The version check also drops an assignment an immediate
 * reassign superseded. One left is the assignment's own push; several are one
 * push that opens the Inbox.
 */
export async function pushTaskAssignments(
    db: HausDatabase,
    sender: PushSender,
    events: readonly TaskAssignedEvent[]
): Promise<void> {
    const [first] = events;
    if (!first) {
        return;
    }
    const { serverId, userId } = first;
    if ((await readPushableMembers(db, serverId, [userId])).length === 0) {
        return;
    }
    const news = await readStillNews(db, events, { serverId, userId });
    const [only] = news;
    if (only && news.length === 1) {
        await pushOneAssignment(db, sender, only);
    } else if (only) {
        await pushAssignmentBurst(db, sender, news);
    }
}

async function readStillNews(
    db: HausDatabase,
    events: readonly TaskAssignedEvent[],
    { serverId, userId }: { serverId: string; userId: string }
) {
    const items = await db
        .select({
            assignmentVersion: taskInboxItemsTable.assignmentVersion,
            taskId: taskInboxItemsTable.taskId,
        })
        .from(taskInboxItemsTable)
        .where(
            and(
                eq(taskInboxItemsTable.serverId, serverId),
                eq(taskInboxItemsTable.userId, userId),
                inArray(
                    taskInboxItemsTable.taskId,
                    events.map((event) => event.taskId)
                ),
                isNull(taskInboxItemsTable.clearedAt)
            )
        );
    const versionByTask = new Map(items.map((item) => [item.taskId, item.assignmentVersion]));
    return events.filter((event) => versionByTask.get(event.taskId) === event.version);
}

async function pushOneAssignment(
    db: HausDatabase,
    sender: PushSender,
    event: TaskAssignedEvent
): Promise<void> {
    const { serverId, taskId, userId } = event;
    const assignerName = await readAssignerName(db, serverId, event.assignedBy);
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

/** The newest assignment leads the body and keys the collapse id: this burst, and no other. */
async function pushAssignmentBurst(
    db: HausDatabase,
    sender: PushSender,
    events: readonly TaskAssignedEvent[]
): Promise<void> {
    const newest = events.at(-1);
    if (!newest) {
        return;
    }
    const { serverId, userId } = newest;
    const count = events.length;
    const assigner = soleAssigner(events);
    const assignerName = assigner ? await readAssignerName(db, serverId, assigner) : null;
    const task = await readTask(db, serverId, newest.taskId);
    const payload: PushTaskAssignmentBurstPayload = {
        aps: {
            alert: {
                body: taskAssignmentBurstNotificationBody({
                    count,
                    newestTitle: messagePreview(task.title, burstBodyTitleMaxLength),
                }),
                title: taskAssignmentBurstNotificationTitle({ assignerName, count }),
            },
            badge: await countUnreadInboxRows(db, userId),
            sound: 'default',
            'thread-id': `task-assignments:${serverId}`,
        },
        count,
        kind: 'task_assignment_burst',
        serverId,
    };
    await sendToDevices(db, sender, userId, {
        collapseId: `task-burst:${newest.taskId}:${newest.version}`,
        payload,
    });
}

function soleAssigner(events: readonly TaskAssignedEvent[]): null | TaskActor {
    const ids = new Set(events.map(({ assignedBy }) => actorId(assignedBy)));
    return ids.size === 1 ? (events[0]?.assignedBy ?? null) : null;
}

function actorId(actor: TaskActor) {
    return actor.kind === 'agent' ? actor.agentId : actor.userId;
}

async function readAssignerName(db: HausDatabase, serverId: string, assignedBy: TaskActor) {
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
