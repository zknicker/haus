import {
    TASK_CLAIM_CONFLICT_ROUTING_NOTE,
    type TaskClaimConflict,
    taskClaimConflictBlockedActionCopy,
} from '@haus/api';

/**
 * A lost claim reads as a concurrency lock, never a verdict on who owns the
 * lane. Server ships the structured conflict and `@haus/api` owns the copy;
 * this is the only place the prose is composed, so the four lines stay in the
 * order an Agent needs them: who holds the lock, what that blocks, what it
 * leaves open, and where a misroute is corrected.
 */
export function formatTaskClaimConflict(conflict: TaskClaimConflict): string {
    const holder = conflict.currentAssignee?.name
        ? `@${conflict.currentAssignee.name}`
        : 'another Agent';
    const blocked = conflict.blockedActions
        .map((action) => taskClaimConflictBlockedActionCopy[action] ?? action)
        .join('; ');
    const examples = conflict.unblockedActionExamples.join(' · ');
    return [
        `Claim failed — ${holder} currently holds the implementation lock (assignment state as of ${conflict.observedAt}).`,
        `Blocked: ${blocked}.`,
        `Not blocked by this claim conflict (each still subject to its own authority/policy): ${examples}.`,
        TASK_CLAIM_CONFLICT_ROUTING_NOTE,
    ].join('\n');
}
