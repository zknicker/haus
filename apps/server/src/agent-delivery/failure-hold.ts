import { and, desc, eq } from 'drizzle-orm';
import { emitServerUpdated } from '../haus-api/server-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentTurnsTable } from '../postgres/schema.ts';
import { isBackedOff } from './retry-policy.ts';
import { readDeliveryState, setAgentChainTurns } from './store.ts';
import {
    nextWakeState,
    releasedWakeState,
    type TurnFailure,
    type WakeState,
} from './wake-pause.ts';

// Enough settled turns to walk the rate-limit schedule to its cap.
const rateLimitStreakWindow = 8;

/** The delivery columns an Agent read selects to project `wakePause`. */
export const wakePauseColumns = {
    consecutiveFailures: agentDeliveryTable.consecutiveFailures,
    lastFailureAt: agentDeliveryTable.lastFailureAt,
    lastFailureCode: agentDeliveryTable.lastFailureCode,
    lastFailureKind: agentDeliveryTable.lastFailureKind,
    pausedAt: agentDeliveryTable.pausedAt,
    retryAfter: agentDeliveryTable.retryAfter,
} as const;

/** Human-lifted wake pauses, announced only once the lifting transaction commits. */
export class WakePauseLifts {
    private readonly pending = new Map<string, string>();

    mark(input: { agentId: string; serverId: string }): void {
        this.pending.set(input.agentId, input.serverId);
    }

    /** Refreshes the App's Agent reads; call after the enqueueing transaction commits. */
    announce(agentId: string): void {
        const serverId = this.pending.get(agentId);
        if (serverId) {
            this.pending.delete(agentId);
            emitServerUpdated({ agentId, scope: 'agent', serverId });
        }
    }
}

/**
 * Human intent lifts a wake pause at once, releases a counted failure hold, and
 * resets the Agent-authored chain ceiling. Outside a pause it never cuts a
 * short or rate-limit backoff window short: the Agent stays parked until
 * `retry_after` passes, however many messages arrive.
 */
export async function releaseHoldsForHuman(
    db: HausDatabase,
    input: { agentId: string; serverId: string },
    lifts: WakePauseLifts
): Promise<void> {
    const state = await readDeliveryState(db, input.agentId);
    if (state?.pausedAt) {
        await clearDeliveryFailures(db, input.agentId);
        lifts.mark(input);
    } else if (state && !isBackedOff(state)) {
        await clearDeliveryFailures(db, input.agentId);
    }
    await setAgentChainTurns(db, { agentId: input.agentId, turns: 0 });
}

/**
 * Clears failure backoff and any wake pause — a completed run, Start, Restart,
 * reset, session recovery, or a runtime/model change re-enables dispatch.
 */
export async function clearDeliveryFailures(db: HausDatabase, agentId: string): Promise<void> {
    await writeWakeState(db, agentId, releasedWakeState);
}

/** Settles a failed turn's wake state; a rate limit's backoff grows with its trailing streak. */
export async function recordTurnFailure(
    db: HausDatabase,
    scope: { agentId: string; serverId: string },
    state: WakeState,
    failure: Omit<TurnFailure, 'rateLimitStreak'>
): Promise<void> {
    const rateLimitStreak =
        failure.failureKind === 'rate-limit' ? await countTrailingRateLimitFailures(db, scope) : 0;
    const next = nextWakeState(state, { ...failure, rateLimitStreak }, new Date());
    await writeWakeState(db, scope.agentId, next);
}

/** Writes exactly the wake-policy columns; `state` may be a wider delivery row. */
async function writeWakeState(db: HausDatabase, agentId: string, state: WakeState) {
    await db
        .update(agentDeliveryTable)
        .set({
            consecutiveFailures: state.consecutiveFailures,
            failureFingerprint: state.failureFingerprint,
            lastFailureAt: state.lastFailureAt,
            lastFailureCode: state.lastFailureCode,
            lastFailureKind: state.lastFailureKind,
            pausedAt: state.pausedAt,
            pauseStep: state.pauseStep,
            retryAfter: state.retryAfter,
            sameFailureStreak: state.sameFailureStreak,
            updatedAt: new Date(),
        })
        .where(eq(agentDeliveryTable.agentId, agentId));
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
