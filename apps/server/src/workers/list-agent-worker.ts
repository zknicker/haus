import type { Worker } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workersTable } from '../postgres/schema.ts';
import { WorkerNotFoundError } from './errors.ts';
import { readWorkerDetails, toWorker } from './worker-shape.ts';

export async function listAgentWorker(
    db: HausDatabase,
    runner: ResolvedRunner,
    workerId?: string
): Promise<Worker[]> {
    const rows = await db
        .select()
        .from(workersTable)
        .where(
            and(
                eq(workersTable.serverId, runner.serverId),
                eq(workersTable.agentId, runner.agentId),
                workerId ? eq(workersTable.id, workerId) : undefined
            )
        )
        .orderBy(desc(workersTable.updatedAt))
        .limit(200);
    if (workerId && rows.length === 0) {
        throw new WorkerNotFoundError();
    }
    const details = await readWorkerDetails(
        db,
        runner.serverId,
        rows.map((row) => row.id)
    );
    const works = rows.map((row) => toWorker(row, details.get(row.id)));
    // A routine list-all-active-works call (no `workerId`) never embeds a Run's
    // full report (TECH-8): it can run to 64 KiB each, and this route is
    // polled far more often than a single-work fetch names a Run to inspect.
    // A single-work fetch (`workerId` set) keeps every stored `report` as is.
    return workerId ? works : works.map(stripReports);
}

function stripReports(work: Worker): Worker {
    return {
        ...work,
        turns: work.turns.map((run) => (run.report ? { ...run, report: null } : run)),
    };
}
