import { and, asc, eq, isNotNull, isNull, notExists } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskPullRequestsTable, tasksTable, workersTable } from '../postgres/schema.ts';

export interface UnworkedTaskWake {
    agentId: string;
    chatId: string;
}

export async function readUnworkedTaskWakes(
    db: Pick<HausDatabase, 'select'>,
    pull: { number: number; repository: string; serverId: string }
): Promise<UnworkedTaskWake[]> {
    const rows = await db
        .select({ agentId: tasksTable.createdByAgentId, chatId: tasksTable.chatId })
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
                eq(taskPullRequestsTable.serverId, pull.serverId),
                eq(taskPullRequestsTable.repository, pull.repository),
                eq(taskPullRequestsTable.number, pull.number),
                isNull(tasksTable.archivedAt),
                isNotNull(tasksTable.chatId),
                isNotNull(tasksTable.createdByAgentId),
                notExists(
                    db
                        .select({ id: workersTable.id })
                        .from(workersTable)
                        .where(
                            and(
                                eq(workersTable.serverId, tasksTable.serverId),
                                eq(workersTable.taskId, tasksTable.id)
                            )
                        )
                )
            )
        )
        .orderBy(asc(taskPullRequestsTable.createdAt), asc(taskPullRequestsTable.taskId))
        .limit(1);
    return rows.flatMap((row) =>
        row.agentId && row.chatId ? [{ agentId: row.agentId, chatId: row.chatId }] : []
    );
}
