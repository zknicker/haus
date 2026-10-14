import { and, desc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { CloudAgentCallbackScope } from './cloud-agent-input-store.ts';

type WorkUpdate = Pick<
    typeof cloudAgentWorkTable.$inferInsert,
    'status' | 'updatedAt' | 'startedAt' | 'terminalAt'
>;

/** An older native prompt remains execution evidence, but never replaces the newest Run's work state. */
export async function projectNativeCloudAgentRun(
    db: HausDatabase,
    scope: Pick<CloudAgentCallbackScope, 'serverId' | 'workId' | 'runId'>,
    update: WorkUpdate
) {
    const [latest] = await db
        .select({ id: cloudAgentRunsTable.id })
        .from(cloudAgentRunsTable)
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, scope.serverId),
                eq(cloudAgentRunsTable.workId, scope.workId)
            )
        )
        .orderBy(desc(cloudAgentRunsTable.createdAt))
        .limit(1);
    await db
        .update(cloudAgentWorkTable)
        .set(
            latest?.id === scope.runId
                ? update
                : {
                      updatedAt: sql`greatest(${cloudAgentWorkTable.updatedAt}, ${update.updatedAt}::timestamptz)`,
                  }
        )
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, scope.serverId),
                eq(cloudAgentWorkTable.id, scope.workId)
            )
        );
}
