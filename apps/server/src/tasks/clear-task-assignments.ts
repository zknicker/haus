import type { ServerDurableEvent } from '@haus/api';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageTasksTable } from '../postgres/schema.ts';
import { insertTaskEvent } from './task-events.ts';

type TaskAssignmentWriter = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

/**
 * Releases task ownership held by one departing Agent. The caller owns the
 * Server lock, so task writers cannot race this selection or its ordered
 * updates.
 */
export async function clearTaskAssignments(
    db: TaskAssignmentWriter,
    serverId: string,
    agentId: string
): Promise<ServerDurableEvent[]> {
    const assigneeColumn = messageTasksTable.assigneeAgentId;
    const assigned = await db
        .select({
            chatId: messageTasksTable.chatId,
            messageId: messageTasksTable.messageId,
        })
        .from(messageTasksTable)
        .where(and(eq(messageTasksTable.serverId, serverId), eq(assigneeColumn, agentId)))
        .orderBy(asc(messageTasksTable.messageId));
    const events: ServerDurableEvent[] = [];

    for (const task of assigned) {
        await db
            .update(messageTasksTable)
            .set({
                assigneeAgentId: null,
                claimedAt: null,
                updatedAt: sql`now()`,
                version: sql`${messageTasksTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageTasksTable.serverId, serverId),
                    eq(messageTasksTable.messageId, task.messageId),
                    eq(assigneeColumn, agentId)
                )
            );
        events.push(
            await insertTaskEvent(db, {
                chatId: task.chatId,
                messageId: task.messageId,
                serverId,
                type: 'task.updated',
            })
        );
    }

    return events;
}
