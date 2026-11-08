import { type CloudAgentWorkAttention, cloudAgentWorkAttentionSchema } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';

/** What a Run contributes to an attention; the inbox row supplies its `notice`. */
export type CloudAgentRunAttention = Omit<CloudAgentWorkAttention, 'notice'>;

const runAttentionSchema = cloudAgentWorkAttentionSchema.omit({ notice: true });

/**
 * The attention one Cloud Agent Run hands its delegating Agent: the outcome it
 * needs to inspect the work and post results as ordinary Messages, keyed by the
 * Run id the inbox row carries.
 */
export async function readCloudAgentWorkAttentions(
    db: HausDatabase,
    serverId: string,
    runIds: string[]
): Promise<Map<string, CloudAgentRunAttention>> {
    const rows = await db
        .select({
            branches: cloudAgentRunsTable.branches,
            errorCode: cloudAgentRunsTable.errorCode,
            provider: cloudAgentWorkTable.provider,
            providerUrl: cloudAgentWorkTable.providerUrl,
            repository: cloudAgentWorkTable.repository,
            runId: cloudAgentRunsTable.id,
            stallCode: cloudAgentRunsTable.stallCode,
            status: cloudAgentRunsTable.status,
            summary: cloudAgentRunsTable.summary,
            title: cloudAgentWorkTable.title,
            workId: cloudAgentWorkTable.id,
        })
        .from(cloudAgentRunsTable)
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, cloudAgentRunsTable.serverId),
                eq(cloudAgentWorkTable.id, cloudAgentRunsTable.workId)
            )
        )
        .where(
            and(eq(cloudAgentRunsTable.serverId, serverId), inArray(cloudAgentRunsTable.id, runIds))
        );
    return new Map(rows.map((row) => [row.runId, runAttentionSchema.parse(row)]));
}
