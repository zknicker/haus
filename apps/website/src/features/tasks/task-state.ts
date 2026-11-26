import type { ClaimStatus } from '../claims/claim-presentation.ts';

/** A Task is active or archived (ADR 0062); `archivedAt` is the only record of it. */
export type TaskState = 'active' | 'archived';

export const taskStateOrder: readonly TaskState[] = ['active', 'archived'];

export const taskStateLabels: Record<TaskState, string> = {
    active: 'Active',
    archived: 'Archived',
};

export const taskStateDiscs: Record<TaskState, ClaimStatus> = {
    active: 'in_progress',
    archived: 'closed',
};

export function taskStateOf(task: { archivedAt: string | null }): TaskState {
    return task.archivedAt === null ? 'active' : 'archived';
}

export function isTaskState(value: unknown): value is TaskState {
    return taskStateOrder.includes(value as TaskState);
}
