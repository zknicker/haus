import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskPullRequestsTable, tasksTable } from '../postgres/schema.ts';
import { prepareTaskUpdatedEvent } from '../tasks/task-events.ts';

export async function prepareLinkedTaskEvents(
    db: Pick<HausDatabase, 'select'>,
    reading: { number: number; repository: string; serverId: string }
) {
    const tasks = await db
        .select({
            chatId: tasksTable.chatId,
            id: tasksTable.id,
            serverId: tasksTable.serverId,
            version: tasksTable.version,
        })
        .from(taskPullRequestsTable)
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, taskPullRequestsTable.serverId),
                eq(tasksTable.id, taskPullRequestsTable.taskId)
            )
        )
        .where(
            and(
                eq(taskPullRequestsTable.serverId, reading.serverId),
                eq(taskPullRequestsTable.repository, reading.repository),
                eq(taskPullRequestsTable.number, reading.number)
            )
        );
    return tasks.map(prepareTaskUpdatedEvent);
}
