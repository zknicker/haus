import {
    type TaskActor,
    type TaskInboxItem,
    taskAssignmentNotificationTitle,
    taskAssignmentNotifiedUserId,
} from '@haus/api';
import type { NotificationApi } from './message-notifier.ts';

export interface TaskAssignmentNotifierOptions {
    /** True while the reader cannot see Haus: the window is hidden or unfocused. */
    isBackground: () => boolean;
    /** True while the Settings toggle is on and this tab leads for the Server. */
    isEnabled: () => boolean;
    notificationApi: NotificationApi | undefined;
    onOpen: (path: string) => void;
    /** The App route of the item's Task, or null when its key does not address one. */
    pathOf: (item: TaskInboxItem) => null | string;
    /** The signed-in human, once the member list has said who that is. */
    viewerUserId: () => string | undefined;
}

/** Enough to absorb a queue of assignments and their restores. */
const rememberedAssignments = 500;

/**
 * Raises a platform notification for a Task someone else handed the reader
 * (ADR 0051), under the shared rule iPhone push uses
 * (`taskAssignmentNotifiedUserId`).
 *
 * `taskInbox.onChanged` carries no item, so the new one is found by diffing the
 * list read the event refreshes: the stream calls `changed`, and each read that
 * lands calls `listRead`. A read only notifies when an event asked for it, so
 * what arrived while the reader was away stays the Inbox's to show, never a
 * burst, as with messages. The first read is what was already waiting.
 *
 * An assignment is one item stamped when it was made, so restoring a cleared
 * item (Undo, on any device) is never news, while handing the Task over again
 * is. The tag is the Task, so a repeat replaces the older notification.
 */
export function createTaskAssignmentNotifier(options: TaskAssignmentNotifierOptions) {
    const seen = new Set<string>();
    let hasBaseline = false;
    let eventPending = false;

    return {
        changed() {
            eventPending = true;
        },
        listRead(items: readonly TaskInboxItem[]) {
            const arrived = items.filter((item) => !seen.has(assignmentKey(item)));
            for (const item of arrived) {
                remember(seen, assignmentKey(item));
            }
            const isLive = hasBaseline && eventPending;
            hasBaseline = true;
            eventPending = false;
            if (isLive && canNotify(options)) {
                for (const item of arrived.filter((entry) => notifiesViewer(entry, options))) {
                    notify(options, item);
                }
            }
        },
    };
}

function assignmentKey({ assignedAt, task }: TaskInboxItem) {
    return `${task.id}:${assignedAt}`;
}

function remember(seen: Set<string>, key: string) {
    seen.add(key);
    if (seen.size > rememberedAssignments) {
        seen.delete(seen.values().next().value as string);
    }
}

function notifiesViewer(item: TaskInboxItem, options: TaskAssignmentNotifierOptions) {
    const viewerUserId = options.viewerUserId();
    return (
        viewerUserId !== undefined &&
        taskAssignmentNotifiedUserId({
            assignee: item.task.assignee,
            assigner: assignerOf(item),
        }) === viewerUserId
    );
}

function assignerOf({ assignedBy }: TaskInboxItem): TaskActor {
    return assignedBy.kind === 'user'
        ? { kind: 'user', userId: assignedBy.id }
        : { agentId: assignedBy.id, kind: 'agent' };
}

function canNotify(options: TaskAssignmentNotifierOptions) {
    return (
        options.notificationApi?.permission === 'granted' &&
        options.isEnabled() &&
        options.isBackground()
    );
}

function notify(options: TaskAssignmentNotifierOptions, item: TaskInboxItem) {
    const Api = options.notificationApi;
    const path = options.pathOf(item);
    if (!(Api && path)) {
        return;
    }
    const notification = new Api(
        taskAssignmentNotificationTitle({
            assignerName: item.assignedBy.label,
            key: item.task.key,
        }),
        { body: item.task.title, tag: `task:${item.task.id}` }
    );
    notification.onclick = (clicked) => {
        clicked.preventDefault();
        notification.close();
        options.onOpen(path);
    };
}
