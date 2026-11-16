import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { type TaskActor, taskActorSchema } from './task.ts';

/**
 * Who a Task assignment notifies (ADR 0051), the sibling of the message rule in
 * `message-notification.ts`. One rule, so the Server's iPhone push and the
 * person's Task Inbox item read the same facts the same way and cannot drift.
 *
 * Only a person is notified, and only about work someone else handed them: an
 * Agent hears through its inbox, and assigning yourself tells you nothing new.
 */
export function taskAssignmentNotifiedUserId(facts: {
    assignee: TaskActor | null;
    assigner: TaskActor;
}): string | null {
    const { assignee, assigner } = facts;
    if (assignee?.kind !== 'user') {
        return null;
    }
    return assigner.kind === 'user' && assigner.userId === assignee.userId ? null : assignee.userId;
}

/** The one line a Task assignment notifies with: "Ada assigned you SEC-12". */
export function taskAssignmentNotificationTitle(input: {
    assignerName: string;
    key: string;
}): string {
    return `${input.assignerName} assigned you ${input.key}`;
}

/**
 * The one alert for several assignments landing together: an Agent filing a
 * queue for one person raises this once, never one per Task, and it opens the
 * Inbox, which still holds one card per Task. `assignerName` is null when the
 * assignments came from more than one assigner, or the assigner has no name.
 */
export function taskAssignmentBurstNotificationTitle(input: {
    assignerName: null | string;
    count: number;
}): string {
    return input.assignerName
        ? `${input.assignerName} assigned you ${input.count} tasks`
        : `${input.count} tasks assigned to you`;
}

/** The burst alert's second line: "Rotate the key and 5 more", the newest Task leading. */
export function taskAssignmentBurstNotificationBody(input: {
    count: number;
    newestTitle: string;
}): string {
    return `${input.newestTitle} and ${input.count - 1} more`;
}

/**
 * `task.assigned`: a Task was handed to someone other than the assigner. A
 * Server-internal notification fact, published after the assignment commits for
 * iPhone push to act on; no client subscribes to it. `version` is the
 * assignment's Task version.
 */
export const taskAssignedEventSchema = z
    .object({
        assignedBy: taskActorSchema,
        serverId: idSchema,
        taskId: idSchema,
        userId: idSchema,
        version: z.number().int().positive(),
    })
    .strict();

export type TaskAssignedEvent = z.infer<typeof taskAssignedEventSchema>;
