import type { Trigger } from '@haus/api';
import { syncArmedGithubTrigger } from '../github/trigger-problem-sync.ts';
import type { GithubTriggerProblemEntered } from '../github/trigger-problems.ts';
import {
    type LinearTriggerProblemEntered,
    syncLinearTriggerProblems,
} from '../linear/trigger-problem-sync.ts';
import type { HausDatabase } from '../postgres/connection.ts';

/** A problem notice arming queued, for the caller's after-commit wake. */
export type TriggerProblemEntered = GithubTriggerProblemEntered | LinearTriggerProblemEntered;

/**
 * Problems follow only armed Triggers, so arming a `github` or `linear`
 * Trigger re-derives its problem in the arming transaction. A webhook has none.
 */
export async function deriveProblemOnArm(
    tx: HausDatabase,
    trigger: Trigger,
    input: { now: Date; serverId: string }
): Promise<TriggerProblemEntered[]> {
    if (trigger.kind === 'github') {
        return await syncArmedGithubTrigger(tx, { ...input, triggerId: trigger.id });
    }
    if (trigger.kind === 'linear') {
        const synced = await syncLinearTriggerProblems(tx, {
            ...input,
            scope: { triggerIds: [trigger.id] },
        });
        return synced.entered;
    }
    return [];
}
