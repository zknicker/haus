import { type CloudAgentInputAttention, cloudAgentInputAttentionSchema } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentInputTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
} from '../postgres/schema.ts';
import { readCloudAgentInput } from './cloud-agent-input-store.ts';

export async function readCloudAgentInputAttentions(
    db: HausDatabase,
    serverId: string,
    ids: string[]
): Promise<Map<string, CloudAgentInputAttention>> {
    const rows = await db
        .select({
            id: cloudAgentInputTable.id,
            title: cloudAgentWorkTable.title,
            repository: cloudAgentWorkTable.repository,
            providerUrl: cloudAgentWorkTable.providerUrl,
        })
        .from(cloudAgentInputTable)
        .innerJoin(
            cloudAgentRunsTable,
            and(
                eq(cloudAgentRunsTable.serverId, cloudAgentInputTable.serverId),
                eq(cloudAgentRunsTable.id, cloudAgentInputTable.runId)
            )
        )
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, cloudAgentRunsTable.serverId),
                eq(cloudAgentWorkTable.id, cloudAgentRunsTable.workId)
            )
        )
        .where(
            and(eq(cloudAgentInputTable.serverId, serverId), inArray(cloudAgentInputTable.id, ids))
        );
    const result = new Map<string, CloudAgentInputAttention>();
    for (const row of rows) {
        result.set(
            row.id,
            cloudAgentInputAttentionSchema.parse({
                request: await readCloudAgentInput(db, serverId, row.id),
                title: row.title,
                repository: row.repository,
                providerUrl: row.providerUrl,
            })
        );
    }
    return result;
}
