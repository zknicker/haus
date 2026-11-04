import { type Task, type TaskAssignee, taskAssignmentNotifiedUserId } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { taskAssignedTopic } from '../realtime/topics.ts';
import { sameTaskActor, type TaskActor } from './task-actor.ts';
import { enqueueTaskAssignment, retireTaskAssignments } from './task-agent-delivery.ts';
import {
    deleteTaskInboxItem,
    prepareTaskInboxChangedEvent,
    upsertTaskInboxItem,
} from './task-inbox-items.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

/** What assignment needs of delivery: the in-transaction enqueue. */
export type TaskAgentDelivery = Pick<AgentDelivery, 'enqueue'>;

/**
 * One change of a Task's assignee, as the transaction that made it sees it:
 * `task` is the record at the version the change produced. `previous` is null
 * for a Task created unassigned or assigned at creation.
 */
export interface TaskAssignmentChange {
    actor: TaskActor;
    next: TaskAssignee | null;
    previous: TaskAssignee | null;
    task: Task;
}

/**
 * Every Task write's result. Publish `events` and wake `wakes` after commit;
 * `assignmentChange` is set when the write changed the assignee.
 */
export interface TaskWriteResult extends TaskAssignmentEffects {
    assignmentChange: TaskAssignmentChange | null;
    task: Task;
}

/** What an assignment change leaves for after commit. */
export interface TaskAssignmentEffects {
    events: PreparedRealtimeEvent[];
    /** Agents whose inbox this change enqueued, to wake once the write commits. */
    wakes: { agentId: string; serverId: string }[];
}

/**
 * The one place an assignment change acts on the people and Agents it touches,
 * run inside the transaction that changed the assignee (`task.create` with an
 * assignee and `task.assign`), so every assignment path gets all of it (ADR 0051):
 *
 * - **Person:** assigning someone other than yourself upserts their Task Inbox
 *   item and announces `task.assigned`, which iPhone push acts on after commit;
 *   reassigning away withdraws the previous person's item.
 * - **Agent:** assigning another Agent enqueues a `task_assignment` inbox item and
 *   a wake; reassigning away withdraws any item still queued.
 */
export async function applyTaskAssignmentChange(
    tx: Tx,
    agentDelivery: TaskAgentDelivery,
    change: TaskAssignmentChange
): Promise<TaskAssignmentEffects> {
    const events: PreparedRealtimeEvent[] = [];
    const wakes: TaskAssignmentEffects['wakes'] = [];
    const { serverId, id: taskId, version } = change.task;
    const { actor, previous, next } = change;

    if (!sameTaskActor(previous, next)) {
        if (previous?.kind === 'user') {
            const withdrawn = await deleteTaskInboxItem(tx, {
                serverId,
                taskId,
                userId: previous.userId,
            });
            if (withdrawn) {
                events.push(prepareTaskInboxChangedEvent({ serverId, userId: previous.userId }));
            }
        }
        if (previous?.kind === 'agent') {
            await retireTaskAssignments(tx, { agentId: previous.agentId, serverId, taskId });
        }
    }
    const notified = taskAssignmentNotifiedUserId({ assignee: next, assigner: actor });
    if (notified) {
        await upsertTaskInboxItem(tx, {
            assignedBy: actor,
            assignmentVersion: version,
            serverId,
            taskId,
            userId: notified,
        });
        events.push(
            prepareTaskInboxChangedEvent({ serverId, userId: notified }),
            taskAssignedTopic.prepare(
                { assignedBy: actor, serverId, taskId, userId: notified, version },
                { audienceUserId: notified }
            )
        );
    }
    if (next?.kind === 'agent' && !sameTaskActor(next, actor)) {
        await enqueueTaskAssignment(tx, agentDelivery, { agentId: next.agentId, change });
        wakes.push({ agentId: next.agentId, serverId });
    }
    return { events, wakes };
}
