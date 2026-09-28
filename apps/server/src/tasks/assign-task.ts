import type { MessageTask, ServerDurableEvent } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageTasksTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { TaskConflictError, TaskNotFoundError } from './claim-task.ts';
import { resolveTaskAssignee } from './resolve-task-assignee.ts';
import {
    lockTaskMemberships,
    requireTaskActorWrite,
    type TaskActor,
    taskActorHandle,
} from './task-actor.ts';
import { deliverTaskAssignment } from './task-assignment-delivery.ts';
import { insertTaskEvent } from './task-events.ts';
import { findMessageTask } from './task-shape.ts';

export class TaskClosedAssignError extends Error {
    constructor() {
        super('A finished task cannot be assigned. Reopen it first.');
        this.name = 'TaskClosedAssignError';
    }
}

export type TaskAssigneeInput =
    | { agentId: string; kind: 'agent' }
    | { kind: 'human'; userId: string }
    | null;

/**
 * Assignment updates the task and hands the assignee a typed delivery, so it
 * carries a list of events rather than the single event the other task
 * mutations return, plus the Agents to wake.
 */
export interface TaskAssignResult {
    events: ServerDurableEvent[];
    task: MessageTask;
    wakes: string[];
}

/**
 * Moves who a task belongs to, and nothing else: status never changes and any
 * claim stamp clears, so the new owner still claims before starting. Any
 * member who can write in the task's Chat may assign it to any member of that
 * Chat, including over someone else's hold (Raft parity). `expectedVersion`
 * is optional for Agents, whose `--expected-revision` is opt-in.
 */
export async function assignTask(
    db: HausDatabase,
    actor: TaskActor | null,
    agentDelivery: AgentDelivery,
    input: {
        assignee: TaskAssigneeInput;
        expectedVersion?: number;
        messageId: string;
        serverId: string;
    }
): Promise<TaskAssignResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!actor) {
            throw new TaskNotFoundError();
        }
        const beforeLock = await findMessageTask(tx, input.serverId, input.messageId);
        if (!beforeLock) {
            throw new TaskNotFoundError();
        }
        await lockTaskMemberships(tx, input.serverId, [
            ...(actor.kind === 'human' ? [actor.member.id] : []),
            ...(input.assignee?.kind === 'human' ? [input.assignee.userId] : []),
        ]);
        if (actor.kind === 'human') {
            await requireServerMembership(tx, actor.member, input.serverId);
        }
        await requireTaskActorWrite(tx, actor, {
            chatId: beforeLock.chatId,
            serverId: input.serverId,
        });
        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${beforeLock.chatId}
            for update
        `);
        await tx.execute(sql`
            select message_id from message_tasks
            where server_id = ${input.serverId} and message_id = ${input.messageId}
            for update
        `);

        const current = await findMessageTask(tx, input.serverId, input.messageId);
        if (!current) {
            throw new TaskNotFoundError();
        }
        if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
            throw new TaskConflictError(
                `That task changed (revision ${current.version}, expected ${input.expectedVersion}); refresh it before assigning.`
            );
        }
        if (current.status === 'done' || current.status === 'closed') {
            throw new TaskClosedAssignError();
        }
        const assignee = await resolveTaskAssignee(tx, {
            assignee: input.assignee,
            chatId: current.chatId,
            serverId: input.serverId,
        });
        // Re-assigning the current owner is success, not a version bump that
        // would invalidate everyone else's expected revision.
        if (
            current.assigneeAgentId === assignee.agentId &&
            current.assigneeUserId === assignee.userId
        ) {
            return { events: [], task: current, wakes: [] };
        }

        await tx
            .update(messageTasksTable)
            .set({
                assigneeAgentId: assignee.agentId,
                assigneeUserId: assignee.userId,
                // Assignment reserves; it never carries a claim. The new owner
                // takes the lock themselves before starting work.
                claimedAt: null,
                updatedAt: sql`now()`,
                version: sql`${messageTasksTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageTasksTable.serverId, input.serverId),
                    eq(messageTasksTable.messageId, input.messageId)
                )
            );
        const taskEvent = await insertTaskEvent(tx, {
            chatId: current.chatId,
            messageId: current.messageId,
            serverId: input.serverId,
            type: 'task.updated',
        });
        const events: ServerDurableEvent[] = taskEvent ? [taskEvent] : [];
        const task = await findMessageTask(tx, input.serverId, input.messageId);
        if (!task) {
            throw new TaskNotFoundError();
        }

        const assignsOtherAgent =
            assignee.agentId !== null &&
            !(actor.kind === 'agent' && actor.agentId === assignee.agentId);
        if (!(assignee.agentId && assignsOtherAgent)) {
            return { events, task, wakes: [] };
        }
        await deliverTaskAssignment(tx, agentDelivery, {
            agentId: assignee.agentId,
            assignedByHandle: await taskActorHandle(tx, actor, input.serverId),
            serverId: input.serverId,
            task,
        });
        return { events, task, wakes: [assignee.agentId] };
    });
}
