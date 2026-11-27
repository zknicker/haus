import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskPullRequestsTable, tasksTable } from '../postgres/schema.ts';

export interface PullRequestTaskWake {
    agentId: string;
    chatId: string;
}

/** The live Task a pull request is attached to, whose agent a change to it wakes. */
export async function readPullRequestTaskWakes(
    db: Pick<HausDatabase, 'select'>,
    pull: { number: number; repository: string; serverId: string }
): Promise<PullRequestTaskWake[]> {
    const rows = await db
        .select({ agentId: tasksTable.agentId, chatId: tasksTable.chatId })
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
                isNotNull(tasksTable.agentId)
            )
        )
        .orderBy(asc(taskPullRequestsTable.createdAt), asc(taskPullRequestsTable.taskId))
        .limit(1);
    return rows.flatMap((row) =>
        row.agentId && row.chatId ? [{ agentId: row.agentId, chatId: row.chatId }] : []
    );
}
