import type { ClaimOrigin, ClaimStatus, ClaimTier } from '../../claims/claim-presentation.ts';

/** The only claim fields the stalled-claim question depends on. */
export interface StalledClaim {
    live: boolean;
    origin: ClaimOrigin;
    status: ClaimStatus;
    tier: ClaimTier;
}

/**
 * A claim an Agent took and did not finish.
 *
 * Every clause is load-bearing. `claimed` keeps this to an Agent's own lock;
 * `in_progress` means the work never landed; `tracked` is Server saying the
 * claiming run settled without answering, which is the one thing that lifts a
 * claim out of bookkeeping; and not `live` means no run holds it now, so no
 * reply is coming. Chat says nothing about these by default — the Agent
 * profile's "Stopped before finishing" section is where a person finds out.
 */
export function selectStalledClaims<TClaim extends StalledClaim>(
    items: readonly TClaim[]
): TClaim[] {
    return items.filter(
        (item) =>
            item.origin === 'claimed' &&
            item.status === 'in_progress' &&
            item.tier === 'tracked' &&
            !item.live
    );
}
