import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workersTable } from '../postgres/schema.ts';
import { WorkerCancelDeniedError, WorkerNotFoundError } from '../workers/errors.ts';

/** Only the Agent that delegated the work may cancel it through the Agent CLI. */
export async function requireCancellableWorkAgent(
    db: Pick<HausDatabase, 'select'>,
    input: { agentId: string; serverId: string; workerId: string }
): Promise<void> {
    const [row] = await db
        .select({ agentId: workersTable.agentId })
        .from(workersTable)
        .where(and(eq(workersTable.serverId, input.serverId), eq(workersTable.id, input.workerId)))
        .limit(1);
    if (!row) {
        throw new WorkerNotFoundError();
    }
    if (row.agentId !== input.agentId) {
        throw new WorkerCancelDeniedError();
    }
}
