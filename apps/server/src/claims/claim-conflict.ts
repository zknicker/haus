import type { ClaimConflict } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, type messageClaimsTable } from '../postgres/schema.ts';

type ClaimConflictReader = Pick<HausDatabase, 'select'>;
type ClaimRow = typeof messageClaimsTable.$inferSelect;

/**
 * The claim lock covers conflicting execution and nothing else, so the blocked
 * set is closed and the unblocked list is illustrative. Everything a reader
 * needs to act correctly on a lost claim rides this object; the Agent CLI
 * renders it, so the Server never composes the prose.
 */
const blockedActions = ['start_conflicting_execution'];

const unblockedActionExamples = [
    'reading the claim and its Thread',
    'replying in the Thread with findings, questions, or review',
    'claiming a different claim in this lane',
    'raising the routing with the people in the original Chat',
];

export async function buildClaimConflict(
    db: ClaimConflictReader,
    serverId: string,
    claim: ClaimRow,
    observedAt: Date
): Promise<ClaimConflict> {
    return {
        blockedActions,
        claimedAt: claim.claimedAt?.toISOString() ?? null,
        conflictScope: 'implementation_execution',
        currentAssignee: await resolveHolder(db, serverId, claim),
        kind: 'claim_conflict',
        observedAt: observedAt.toISOString(),
        status: claim.status,
        unblockedActionExamples,
    };
}

async function resolveHolder(
    db: ClaimConflictReader,
    serverId: string,
    claim: ClaimRow
): Promise<ClaimConflict['currentAssignee']> {
    if (claim.assigneeAgentId) {
        const [agent] = await db
            .select({ handle: agentsTable.handle })
            .from(agentsTable)
            .where(
                and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, claim.assigneeAgentId))
            )
            .limit(1);
        return { name: agent?.handle ?? null, type: 'agent' };
    }
    return null;
}
