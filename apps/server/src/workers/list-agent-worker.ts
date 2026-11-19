import type { Worker } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { workersTable } from '../postgres/schema.ts';
import { WorkerNotFoundError } from './errors.ts';
import { readWorkDetails, toWorker } from './worker-shape.ts';

export async function listAgentWorker(
    db: HausDatabase,
    runner: ResolvedRunner,
    workId?: string
): Promise<Worker[]> {
    const rows = await db
        .select()
        .from(workersTable)
        .where(
            and(
                eq(workersTable.serverId, runner.serverId),
                eq(workersTable.agentId, runner.agentId),
                workId ? eq(workersTable.id, workId) : undefined
            )
        )
        .orderBy(desc(workersTable.updatedAt))
        .limit(200);
    if (workId && rows.length === 0) {
        throw new WorkerNotFoundError();
    }
    const details = await readWorkDetails(
        db,
        runner.serverId,
        rows.map((row) => row.id)
    );
    const works = rows.map((row) => toWorker(row, details.get(row.id)));
    // A routine list-all-active-works call (no `workId`) never embeds a Run's
    // full report (TECH-8): it can run to 64 KiB each, and this route is
    // polled far more often than a single-work fetch names a Run to inspect.
    // A single-work fetch (`workId` set) keeps every stored `report` as is.
    return workId ? works : works.map(stripReports);
}

function stripReports(work: Worker): Worker {
    return {
        ...work,
        runs: work.runs.map((run) => (run.report ? { ...run, report: null } : run)),
    };
}
