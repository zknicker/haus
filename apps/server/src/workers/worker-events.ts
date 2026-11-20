import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable, workersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { workerUpdatedTopic } from '../realtime/topics.ts';

/**
 * Prepares one `worker.updated` per changed Worker, scoped to the readers of
 * its Task's Chat. Read-only history has no Task and never changes, so it
 * publishes nothing.
 */
export async function prepareWorkerEvents(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; workerIds: readonly string[] }
): Promise<PreparedRealtimeEvent[]> {
    const workerIds = [...new Set(input.workerIds)];
    if (workerIds.length === 0) {
        return [];
    }
    const rows = await db
        .select({ chatId: tasksTable.chatId, taskId: tasksTable.id, workerId: workersTable.id })
        .from(workersTable)
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, workersTable.serverId),
                eq(tasksTable.id, workersTable.taskId)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                inArray(workersTable.id, workerIds),
                isNotNull(tasksTable.chatId)
            )
        );
    return rows.flatMap(({ chatId, taskId, workerId }) =>
        chatId
            ? [workerUpdatedTopic.prepare({ chatId, serverId: input.serverId, taskId, workerId })]
            : []
    );
}
