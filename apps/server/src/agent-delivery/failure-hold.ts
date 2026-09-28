import { and, desc, eq, isNull, lte, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentTurnsTable } from '../postgres/schema.ts';
import { type DeliveryFailureInput, nextFailureHold } from './retry-policy.ts';
import { recordDeliveryFailure } from './store.ts';

// Enough settled turns to walk the rate-limit schedule to its cap.
const rateLimitStreakWindow = 8;

/**
 * Human intent releases a degraded or counted failure hold, but never cuts an
 * active backoff window short: a rate-limited Agent stays parked until
 * `retry_after` passes, however many messages arrive.
 */
export async function releaseFailureHoldForHuman(
    db: HausDatabase,
    agentId: string,
    now = new Date()
): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({ consecutiveFailures: 0, retryAfter: null, updatedAt: now })
        .where(
            and(
                eq(agentDeliveryTable.agentId, agentId),
                or(isNull(agentDeliveryTable.retryAfter), lte(agentDeliveryTable.retryAfter, now))
            )
        );
}

/** Settles a failed turn's hold; a rate limit's backoff grows with its trailing streak. */
export async function recordTurnFailure(
    db: HausDatabase,
    scope: { agentId: string; serverId: string },
    turn: Pick<DeliveryFailureInput, 'consecutiveFailures' | 'failureKind' | 'outputProduced'>
): Promise<void> {
    const rateLimitStreak =
        turn.failureKind === 'rate-limit' ? await countTrailingRateLimitFailures(db, scope) : 0;
    const hold = nextFailureHold({ ...turn, rateLimitStreak });
    await recordDeliveryFailure(db, { agentId: scope.agentId, ...hold });
}

/** Counts this Agent's most recent consecutive rate-limited turns, newest first. */
async function countTrailingRateLimitFailures(
    db: HausDatabase,
    input: { agentId: string; serverId: string }
): Promise<number> {
    const turns = await db
        .select({ failureKind: agentTurnsTable.failureKind, status: agentTurnsTable.status })
        .from(agentTurnsTable)
        .where(
            and(
                eq(agentTurnsTable.serverId, input.serverId),
                eq(agentTurnsTable.agentId, input.agentId)
            )
        )
        .orderBy(desc(agentTurnsTable.reportedAt), desc(agentTurnsTable.endedAt))
        .limit(rateLimitStreakWindow);
    const streakEnd = turns.findIndex(
        (turn) => turn.status !== 'failed' || turn.failureKind !== 'rate-limit'
    );
    return streakEnd === -1 ? turns.length : streakEnd;
}
