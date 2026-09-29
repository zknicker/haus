import type { TaskOrigin, TaskStatus, TaskTier } from '../../tasks/task-presentation.ts';

/** The only Task fields the stalled-claim question depends on. */
export interface StalledClaimTask {
    live: boolean;
    origin: TaskOrigin;
    status: TaskStatus;
    tier: TaskTier;
}

/**
 * A claim an Agent took and did not finish.
 *
 * Every clause is load-bearing. `claimed` keeps this to an Agent's own lock;
 * `in_progress` means the work never landed; `tracked` is Server saying the
 * claiming run settled without answering, which is the one thing that lifts a
 * claim out of bookkeeping; and not `live` means no run holds it now, so no
 * reply is coming. Chat says nothing about these by default — the Tasks
 * List's "Stopped before finishing" group is where a person finds out.
 */
export function selectStalledClaims<TTask extends StalledClaimTask>(
    items: readonly TTask[]
): TTask[] {
    return items.filter(
        (item) =>
            item.origin === 'claimed' &&
            item.status === 'in_progress' &&
            item.tier === 'tracked' &&
            !item.live
    );
}
