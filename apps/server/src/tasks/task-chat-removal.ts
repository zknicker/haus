import { isClosedTaskState } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';

export async function detachTasksFromRemovedChats(
    tx: HausDatabase,
    input: { chatIds: readonly string[]; serverId: string }
): Promise<PreparedRealtimeEvent[]> {
    if (input.chatIds.length === 0) {
        return [];
    }
    const tasks = await tx
        .select({ id: tasksTable.id, state: tasksTable.state })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                inArray(tasksTable.chatId, [...input.chatIds])
            )
        );
    const events: PreparedRealtimeEvent[] = [];
    for (const task of tasks) {
        const closed = isClosedTaskState(task.state);
        const [detached] = await tx
            .update(tasksTable)
            .set({
                chatId: null,
                ...(closed
                    ? {}
                    : {
                          completedAt: sql`coalesce(${tasksTable.completedAt}, now())`,
                          state: 'canceled' as const,
                      }),
                updatedAt: sql`now()`,
                version: sql`${tasksTable.version} + 1`,
            })
            .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.id, task.id)))
            .returning({ version: tasksTable.version });
        if (detached) {
            events.push(
                prepareTaskUpdatedEvent({
                    chatId: null,
                    id: task.id,
                    serverId: input.serverId,
                    version: detached.version,
                })
            );
        }
    }
    return events;
}
