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
    return rows.map((row) => toCloudAgentWork(row, details.get(row.id)));
}
