import type { ClaimTier } from '@haus/api';

/** The claim columns the tier predicate reads. */
export interface ClaimTierRow {
    messageId: string;
    origin: 'claimed' | 'composed' | 'converted';
    status: 'closed' | 'done' | 'in_progress' | 'in_review' | 'todo';
    trackedAt: Date | null;
}

/**
 * The only two statuses a claim passes through on its own: it is working, or
 * it finished. Any other status is somebody steering the claim, which is why
 * moving to one also stamps `tracked_at` — see `stampsClaimTracked`.
 */
const backgroundStatuses = new Set<ClaimTierRow['status']>(['in_progress', 'done']);

/**
 * A background claim is an Agent's record-keeping lock on work it started and
 * finished without anyone else needing to watch: it claimed a message nobody
 * had promoted, and it never asked for review or outlived its own run. Thread replies do not affect the tier; a Thread is a separate
 * conversation surface. Anything else is tracked and belongs on the default
 * Board and List.
 */
export function resolveClaimTier(claim: ClaimTierRow): ClaimTier {
    const background =
        claim.origin === 'claimed' &&
        backgroundStatuses.has(claim.status) &&
        claim.trackedAt === null;
    return background ? 'background' : 'tracked';
}

/**
 * Whether writing this status also stamps the claim tracked. Status is the one
 * tier input that can move backwards, so every exit from the claim's own
 * lifecycle — review, closure, a reopen to `todo` — is persisted the moment it
 * happens. Without the stamp a claim could read background again on the next
 * status change; with it, tier only ever moves background to tracked.
 */
export function stampsClaimTracked(status: ClaimTierRow['status'] | undefined): boolean {
    return status !== undefined && !backgroundStatuses.has(status);
}
