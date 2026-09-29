import { sql } from 'drizzle-orm';
import { stampsTaskTracked } from './task-tier.ts';

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'closed';

/**
 * Status is a member-level action (Raft parity): anyone who can write in the
 * task's Chat may move it, but only along these edges. `closed` is the
 * reversible "won't do" state reachable from anywhere; an assigned task may
 * resume straight from it, unassigned work reopens through `todo`.
 */
const taskStatusTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
    closed: ['todo', 'in_progress'],
    done: ['todo', 'in_progress', 'in_review', 'closed'],
    in_progress: ['in_review', 'done', 'closed'],
    in_review: ['done', 'in_progress', 'closed'],
    todo: ['in_progress', 'closed'],
};

interface TaskStatusState {
    assigneeAgentId: null | string;
    claimedAt: Date | null | string;
    status: TaskStatus;
}

/**
 * Why a status change is refused, or null. `force` is the Owner/Admin
 * override: it skips the transition table but not the start rules, which are
 * concurrency and ownership invariants rather than permissions.
 */
export function taskStatusChangeError(
    task: TaskStatusState,
    next: TaskStatus,
    options: { force: boolean }
): null | string {
    if (task.status === next) {
        return `The task is already ${next}.`;
    }
    if (!(options.force || taskStatusTransitions[task.status].includes(next))) {
        return `A task cannot move from ${task.status} to ${next}.`;
    }
    if (next === 'in_progress' && (task.status === 'todo' || task.status === 'closed')) {
        if (!task.assigneeAgentId) {
            return 'Claim the task before moving it to in_progress.';
        }
        if (task.status === 'todo' && task.claimedAt !== null) {
            return 'Someone started this task concurrently; refresh it before updating.';
        }
    }
    return null;
}

/**
 * Columns for a validated status change. Starting assigned work stamps the
 * claim epoch, and returning to `todo` clears it: `todo` with a claim stamp
 * would read as a concurrent start and wedge the task. Leaving the claim's own
 * `in_progress`/`done` lifecycle stamps the task tracked.
 */
export function taskStatusColumns(task: TaskStatusState, next: TaskStatus) {
    const starts =
        next === 'in_progress' &&
        (task.status === 'todo' || task.status === 'closed') &&
        Boolean(task.assigneeAgentId);
    return {
        status: next,
        ...(starts ? { claimedAt: sql`now()` } : {}),
        ...(next === 'todo' ? { claimedAt: null } : {}),
        ...(stampsTaskTracked(next) ? { trackedAt: sql`now()` } : {}),
    };
}
