import { and, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { enqueueInboxItem, ensureDeliveryState } from '../agent-delivery/store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    projectRepoLinksTable,
    projectReposTable,
    tasksTable,
    workersTable,
} from '../postgres/schema.ts';
import { settleWorkerTurnAsFailed } from './settle-worker-turn.ts';

type WorkerRow = typeof workersTable.$inferSelect;

export const repoUnlinkedDetail = 'repo-unlinked';

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

export async function refuseUnlinkedTurn(
    tx: HausDatabase,
    input: { turnId: string; worker: WorkerRow }
) {
    return await settleWorkerTurnAsFailed(tx, workerReportInbox, {
        detail: repoUnlinkedDetail,
        reason: 'launch-refused',
        turnId: input.turnId,
        worker: input.worker,
    });
}

const workerReportInbox = {
    enqueue: async (tx, input) => {
        await ensureDeliveryState(tx, { agentId: input.agentId, serverId: input.serverId });
        await enqueueInboxItem(tx, { ...input, source: 'worker_report' });
    },
} satisfies Pick<AgentDelivery, 'enqueue'>;
