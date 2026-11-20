import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    projectRepoLinksTable,
    projectReposTable,
    tasksTable,
    workersTable,
} from '../postgres/schema.ts';

type WorkerRow = typeof workersTable.$inferSelect;

export async function readWorkerRepoLink(tx: HausDatabase, worker: WorkerRow) {
    if (!worker.taskId) {
        return null;
    }
    const [link] = await tx
        .select({ checkoutPath: projectRepoLinksTable.checkoutPath })
        .from(projectRepoLinksTable)
        .innerJoin(
            projectReposTable,
            and(
                eq(projectReposTable.serverId, projectRepoLinksTable.serverId),
                eq(projectReposTable.id, projectRepoLinksTable.projectRepoId)
            )
        )
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, projectReposTable.serverId),
                eq(tasksTable.projectId, projectReposTable.projectId)
            )
        )
        .where(
            and(
                eq(projectRepoLinksTable.serverId, worker.serverId),
                eq(projectRepoLinksTable.computerId, worker.carrierComputerId),
                eq(tasksTable.id, worker.taskId),
                sql`lower(${projectReposTable.repository}) = lower(${worker.repository})`
            )
        )
        .limit(1);
    return link ?? null;
}
