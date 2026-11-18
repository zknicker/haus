import type { CloudAgentWork } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';

import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentWorkTable } from '../postgres/schema.ts';
import { readWorkDetails, toCloudAgentWork } from './cloud-agent-shape.ts';
import { CloudAgentWorkNotFoundError } from './errors.ts';

export async function listAgentCloudAgentWork(
    db: HausDatabase,
    runner: ResolvedRunner,
    workId?: string
): Promise<CloudAgentWork[]> {
    const rows = await db
        .select()
        .from(cloudAgentWorkTable)
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, runner.serverId),
                eq(cloudAgentWorkTable.agentId, runner.agentId),
                workId ? eq(cloudAgentWorkTable.id, workId) : undefined
            )
        )
        .orderBy(desc(cloudAgentWorkTable.updatedAt))
        .limit(200);
    if (workId && rows.length === 0) {
        throw new CloudAgentWorkNotFoundError();
    }
    const details = await readWorkDetails(
        db,
        runner.serverId,
        rows.map((row) => row.id)
    );
    const works = rows.map((row) => toCloudAgentWork(row, details.get(row.id)));
    // A routine list-all-active-works call (no `workId`) never embeds a Run's
    // full report (TECH-8): it can run to 64 KiB each, and this route is
    // polled far more often than a single-work fetch names a Run to inspect.
    // A single-work fetch (`workId` set) keeps every stored `report` as is.
    return workId ? works : works.map(stripReports);
}

function stripReports(work: CloudAgentWork): CloudAgentWork {
    return {
        ...work,
        runs: work.runs.map((run) => (run.report ? { ...run, report: null } : run)),
    };
}
