import { and, eq } from 'drizzle-orm';
import {
    CloudAgentCancelDeniedError,
    CloudAgentWorkNotFoundError,
} from '../cloud-agents/errors.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentWorkTable } from '../postgres/schema.ts';

/** Only the Agent that delegated the work may cancel it through the Agent CLI. */
export async function requireCancellableWorkAgent(
    db: Pick<HausDatabase, 'select'>,
    input: { agentId: string; serverId: string; workId: string }
): Promise<void> {
    const [row] = await db
        .select({ agentId: cloudAgentWorkTable.agentId })
        .from(cloudAgentWorkTable)
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                eq(cloudAgentWorkTable.id, input.workId)
            )
        )
        .limit(1);
    if (!row) {
        throw new CloudAgentWorkNotFoundError();
    }
    if (row.agentId !== input.agentId) {
        throw new CloudAgentCancelDeniedError();
    }
}
