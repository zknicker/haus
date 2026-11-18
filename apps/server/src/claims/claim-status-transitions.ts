import { sql } from 'drizzle-orm';
import { stampsClaimTracked } from './claim-tier.ts';

export type ClaimStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'closed';

/**
 * Status is a member-level action (Raft parity): anyone who can write in the
 * claim's Chat may move it, but only along these edges. `closed` is the
 * reversible "won't do" state reachable from anywhere; an assigned claim may
 * resume straight from it, unassigned work reopens through `todo`.
 */
const claimStatusTransitions: Record<ClaimStatus, readonly ClaimStatus[]> = {
    closed: ['todo', 'in_progress'],
    done: ['todo', 'in_progress', 'in_review', 'closed'],
    in_progress: ['in_review', 'done', 'closed'],
    in_review: ['done', 'in_progress', 'closed'],
    todo: ['in_progress', 'closed'],
};

interface ClaimStatusState {
    assigneeAgentId: null | string;
    claimedAt: Date | null | string;
    status: ClaimStatus;
}

/**
 * Why a status change is refused, or null. `force` is the Owner/Admin
 * override: it skips the transition table but not the start rules, which are
 * concurrency and ownership invariants rather than permissions.
 */
export function claimStatusChangeError(
    claim: ClaimStatusState,
    next: ClaimStatus,
    options: { force: boolean }
): null | string {
    if (claim.status === next) {
        return `The claim is already ${next}.`;
    }
    if (!(options.force || claimStatusTransitions[claim.status].includes(next))) {
        return `A claim cannot move from ${claim.status} to ${next}.`;
    }
    if (next === 'in_progress' && (claim.status === 'todo' || claim.status === 'closed')) {
        if (!claim.assigneeAgentId) {
            return 'Take the claim before moving it to in_progress.';
        }
        if (claim.status === 'todo' && claim.claimedAt !== null) {
            return 'Someone started this claim concurrently; refresh it before updating.';
        }
    }
    return null;
}

/**
 * Columns for a validated status change. Starting assigned work stamps the
 * claim epoch, and returning to `todo` clears it: `todo` with a claim stamp
 * would read as a concurrent start and wedge the claim. Leaving the claim's own
 * `in_progress`/`done` lifecycle stamps the claim tracked.
 */
export function claimStatusColumns(claim: ClaimStatusState, next: ClaimStatus) {
    const starts =
        next === 'in_progress' &&
        (claim.status === 'todo' || claim.status === 'closed') &&
        Boolean(claim.assigneeAgentId);
    return {
        status: next,
        ...(starts ? { claimedAt: sql`now()` } : {}),
        ...(next === 'todo' ? { claimedAt: null } : {}),
        ...(stampsClaimTracked(next) ? { trackedAt: sql`now()` } : {}),
    };
}
