import type { MessageTask, ServerDurableEvent } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { targetForChat } from '../agent-api/message-view.ts';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import { followInlineReplyForMessage } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentThreadFollowsTable,
    chatMessagesTable,
    chatsTable,
    messageTasksTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { TaskConflictError, TaskNotFoundError } from './claim-task.ts';
import { resolveTaskAssignee } from './resolve-task-assignee.ts';
import { taskAssignmentEnvelope, taskAssignmentKey } from './task-assignment-envelope.ts';
import { insertTaskEvent } from './task-events.ts';
import { findMessageTask } from './task-shape.ts';

export class TaskAdminRequiredError extends Error {
    constructor() {
        super('Only a Server Owner or Admin may assign tasks to another member.');
        this.name = 'TaskAdminRequiredError';
    }
}

export class TaskClosedAssignError extends Error {
    constructor() {
        super('A finished task cannot be assigned. Reopen it first.');
        this.name = 'TaskClosedAssignError';
    }
}

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

export async function assignTask(
    db: HausDatabase,
    member: HausUser | null,
    agentDelivery: AgentDelivery,
    input: {
        assignee: { agentId: string; kind: 'agent' } | { kind: 'human'; userId: string } | null;
        expectedVersion: number;
        messageId: string;
        serverId: string;
    }
): Promise<TaskAssignResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!member) {
            throw new TaskNotFoundError();
        }
        const currentBeforeLock = await findMessageTask(tx, input.serverId, input.messageId);
        if (!currentBeforeLock) {
            throw new TaskNotFoundError();
        }

        const assigneeUserIdInput = input.assignee?.kind === 'human' ? input.assignee.userId : null;
        const membershipIds = [...new Set([member.id, assigneeUserIdInput].filter(Boolean))].sort();
        for (const userId of membershipIds) {
            await tx.execute(sql`
                select user_id from server_memberships
                where server_id = ${input.serverId}
                  and user_id = ${userId}
                  and revoked_at is null
                for update
            `);
        }

        const server = await requireServerMembership(tx, member, input.serverId);
        if (server.role !== 'owner' && server.role !== 'admin') {
            throw new TaskAdminRequiredError();
        }
        await requireChatWriteAccess(tx, member, {
            chatId: currentBeforeLock.chatId,
            serverId: input.serverId,
        });
        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${currentBeforeLock.chatId}
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
        if (current.version !== input.expectedVersion) {
            throw new TaskConflictError('That task changed; refresh it before assigning.');
        }
        if (current.status === 'done' || current.status === 'closed') {
            throw new TaskClosedAssignError();
        }
        const assignee = await resolveTaskAssignee(tx, {
            assignee: input.assignee,
            chatId: current.chatId,
            serverId: input.serverId,
        });

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
        const events: ServerDurableEvent[] = [];
        const taskEvent = await insertTaskEvent(tx, {
            chatId: current.chatId,
            messageId: current.messageId,
            serverId: input.serverId,
            type: 'task.updated',
        });
        if (taskEvent) {
            events.push(taskEvent);
        }
        const task = await findMessageTask(tx, input.serverId, input.messageId);
        if (!task) {
            throw new TaskNotFoundError();
        }

        const wakes: string[] = [];
        if (assignee.agentId) {
            await followInlineReplyForMessage(tx, {
                agentId: assignee.agentId,
                chatId: task.chatId,
                messageId: task.messageId,
                serverId: input.serverId,
            });
            // Follow first: thread delivery is gated on this row, so without it
            // the Agent would wake, claim, and then never see a single reply.
            // A Thread nobody has replied in has no row to point at yet; the
            // first reply materializes it and attaches the assignee's follow.
            const [thread] = await tx
                .select({ id: chatsTable.id })
                .from(chatsTable)
                .where(
                    and(
                        eq(chatsTable.serverId, input.serverId),
                        eq(chatsTable.id, task.threadChatId)
                    )
                )
                .limit(1);
            if (thread) {
                await tx
                    .insert(agentThreadFollowsTable)
                    .values({
                        agentId: assignee.agentId,
                        followed: true,
                        serverId: input.serverId,
                        threadChatId: task.threadChatId,
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        set: { followed: true, updatedAt: new Date() },
                        target: [
                            agentThreadFollowsTable.serverId,
                            agentThreadFollowsTable.agentId,
                            agentThreadFollowsTable.threadChatId,
                        ],
                    });
            }

            // The task's title is its canonical message's content.
            const [anchor] = await tx
                .select({ content: chatMessagesTable.content })
                .from(chatMessagesTable)
                .where(
                    and(
                        eq(chatMessagesTable.serverId, input.serverId),
                        eq(chatMessagesTable.id, current.messageId)
                    )
                )
                .limit(1);
            const [assigner] = await tx
                .select({ handle: serverMembershipsTable.handle })
                .from(serverMembershipsTable)
                .where(
                    and(
                        eq(serverMembershipsTable.serverId, input.serverId),
                        eq(serverMembershipsTable.userId, member.id)
                    )
                )
                .limit(1);
            // The handoff is a private Agent delivery, so it is typed pending
            // work and never a Chat message. The delivery key carries the new
            // version: a task can be reassigned many times.
            await agentDelivery.enqueue(tx, {
                agentId: assignee.agentId,
                chatId: current.chatId,
                content: taskAssignmentEnvelope({
                    assignedByHandle: assigner?.handle ?? null,
                    number: task.number,
                    target: await targetForChat(tx, input.serverId, current.chatId),
                    title: anchor?.content ?? '',
                }),
                dedupeKey: taskAssignmentKey(current.messageId, task.version),
                mentioned: true,
                serverId: input.serverId,
                source: 'task_assignment',
            });
            wakes.push(assignee.agentId);
        }

        return { events, task, wakes };
    });
}
