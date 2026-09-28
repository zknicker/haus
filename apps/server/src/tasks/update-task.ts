import { and, eq, sql } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageTaskLabelsTable, messageTasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { TaskConflictError, type TaskMutationResult, TaskNotFoundError } from './claim-task.ts';
import { insertTaskEvent } from './task-events.ts';
import { requireTaskLabelIds } from './task-labels.ts';
import { findMessageTask } from './task-shape.ts';
import { type TaskStatus, taskStatusColumns } from './task-status-transitions.ts';

export async function updateTask(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        expectedVersion: number;
        messageId: string;
        patch: {
            labelIds?: string[];
            priority?: 'none' | 'urgent' | 'high' | 'medium' | 'low';
            status?: 'todo' | 'in_progress' | 'in_review' | 'done' | 'closed';
        };
        serverId: string;
    }
): Promise<TaskMutationResult> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if (!member) {
            throw new TaskNotFoundError();
        }
        const beforeLock = await findMessageTask(tx, input.serverId, input.messageId);
        if (!beforeLock) {
            throw new TaskNotFoundError();
        }
        await tx.execute(sql`
            select user_id from server_memberships
            where server_id = ${input.serverId}
              and user_id = ${member.id}
              and revoked_at is null
            for update
        `);
        await requireChatWriteAccess(tx, member, {
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
        if (current.version !== input.expectedVersion) {
            throw new TaskConflictError('That task changed; refresh it before updating.');
        }
        if (input.patch.labelIds) {
            await requireTaskLabelIds(tx, input.serverId, input.patch.labelIds);
            await tx
                .delete(messageTaskLabelsTable)
                .where(
                    and(
                        eq(messageTaskLabelsTable.serverId, input.serverId),
                        eq(messageTaskLabelsTable.messageId, input.messageId)
                    )
                );
            const labelIds = [...new Set(input.patch.labelIds)];
            if (labelIds.length > 0) {
                await tx.insert(messageTaskLabelsTable).values(
                    labelIds.map((labelId) => ({
                        labelId,
                        messageId: input.messageId,
                        serverId: input.serverId,
                    }))
                );
            }
        }
        await tx
            .update(messageTasksTable)
            .set(taskPatchColumns(current, input.patch))
            .where(
                and(
                    eq(messageTasksTable.serverId, input.serverId),
                    eq(messageTasksTable.messageId, input.messageId)
                )
            );
        const event = await insertTaskEvent(tx, {
            chatId: current.chatId,
            messageId: current.messageId,
            serverId: input.serverId,
            type: 'task.updated',
        });
        const task = await findMessageTask(tx, input.serverId, input.messageId);
        if (!task) {
            throw new TaskNotFoundError();
        }
        return { event, task };
    });
}

/**
 * People in the App set status freely (member-level, no transition table);
 * the shared columns keep the claim stamp and tracked tier consistent with the
 * Agent path. An unchanged status is not a status change.
 */
function taskPatchColumns(
    current: Parameters<typeof taskStatusColumns>[0],
    patch: {
        priority?: 'none' | 'urgent' | 'high' | 'medium' | 'low';
        status?: TaskStatus;
    }
) {
    return {
        ...(patch.priority ? { priority: patch.priority } : {}),
        ...(patch.status && patch.status !== current.status
            ? taskStatusColumns(current, patch.status)
            : {}),
        updatedAt: sql`now()`,
        version: sql`${messageTasksTable.version} + 1`,
    };
}
