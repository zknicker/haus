import type { TaskClaimConflict } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, type messageTasksTable } from '../postgres/schema.ts';

type ClaimConflictReader = Pick<HausDatabase, 'select'>;
type TaskRow = typeof messageTasksTable.$inferSelect;

/**
 * The claim lock covers conflicting execution and nothing else, so the blocked
 * set is closed and the unblocked list is illustrative. Everything a reader
 * needs to act correctly on a lost claim rides this object; the Agent CLI
 * renders it, so the Server never composes the prose.
 */
const blockedActions = ['start_conflicting_execution'];

const unblockedActionExamples = [
    'reading the task and its Thread',
    'replying in the Thread with findings, questions, or review',
    'claiming a different task in this lane',
    'raising the routing with the people in the original Chat',
];

export async function buildTaskClaimConflict(
    db: ClaimConflictReader,
    serverId: string,
    task: TaskRow,
    observedAt: Date
): Promise<TaskClaimConflict> {
    return {
        blockedActions,
        claimedAt: task.claimedAt?.toISOString() ?? null,
        conflictScope: 'implementation_execution',
        currentAssignee: await resolveHolder(db, serverId, task),
        kind: 'claim_conflict',
        observedAt: observedAt.toISOString(),
        status: task.status,
        unblockedActionExamples,
    };
}

async function resolveHolder(
    db: ClaimConflictReader,
    serverId: string,
    task: TaskRow
): Promise<TaskClaimConflict['currentAssignee']> {
    if (task.assigneeAgentId) {
        const [agent] = await db
            .select({ handle: agentsTable.handle })
            .from(agentsTable)
            .where(
                and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, task.assigneeAgentId))
            )
            .limit(1);
        return { name: agent?.handle ?? null, type: 'agent' };
    }
    return null;
}
