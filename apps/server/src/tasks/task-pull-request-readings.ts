import { and, asc, eq } from 'drizzle-orm';
import { toPullRequestReading } from '../github/pull-request-readings.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { pullRequestReadingsTable, taskPullRequestsTable } from '../postgres/schema.ts';

export async function readTaskPullRequestReadings(
    db: Pick<HausDatabase, 'select'>,
    task: { id: string; serverId: string }
) {
    const rows = await db
        .select({ reading: pullRequestReadingsTable })
        .from(taskPullRequestsTable)
        .innerJoin(
            pullRequestReadingsTable,
            and(
                eq(pullRequestReadingsTable.serverId, taskPullRequestsTable.serverId),
                eq(pullRequestReadingsTable.repository, taskPullRequestsTable.repository),
                eq(pullRequestReadingsTable.number, taskPullRequestsTable.number)
            )
        )
        .where(
            and(
                eq(taskPullRequestsTable.serverId, task.serverId),
                eq(taskPullRequestsTable.taskId, task.id)
            )
        )
        .orderBy(asc(taskPullRequestsTable.createdAt))
        .limit(20);
    return rows.map((row) => toPullRequestReading(row.reading));
}
