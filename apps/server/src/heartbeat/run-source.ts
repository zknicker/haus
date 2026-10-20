import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable } from '../postgres/schema.ts';

/** The inbox source that started the calling run, or null when the Server recorded none. */
export async function readRunSource(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'runId' | 'serverId'>
): Promise<string | null> {
    const [row] = await db
        .select({ source: agentRunTriggersTable.source })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, runner.serverId),
                eq(agentRunTriggersTable.agentId, runner.agentId),
                eq(agentRunTriggersTable.runId, runner.runId)
            )
        )
        .limit(1);
    return row?.source ?? null;
}
