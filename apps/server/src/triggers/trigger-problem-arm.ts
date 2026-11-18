import type { Trigger } from '@haus/api';
import { syncArmedGithubTrigger } from '../github/trigger-problem-sync.ts';
import type { GithubTriggerProblemEntered } from '../github/trigger-problems.ts';
import type { HausDatabase } from '../postgres/connection.ts';

/** A problem notice arming queued, for the caller's after-commit wake. */
export type TriggerProblemEntered = GithubTriggerProblemEntered;

/**
 * Problems follow only armed Triggers, so arming a `github` Trigger
 * re-derives its problem in the arming transaction. A webhook has none.
 */
export async function deriveProblemOnArm(
    tx: HausDatabase,
    trigger: Trigger,
    input: { now: Date; serverId: string }
): Promise<TriggerProblemEntered[]> {
    if (trigger.kind === 'github') {
        return await syncArmedGithubTrigger(tx, { ...input, triggerId: trigger.id });
    }
    return [];
}
