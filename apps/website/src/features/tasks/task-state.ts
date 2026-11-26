import type { ClaimStatus } from '../claims/claim-presentation.ts';

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

export function taskStateOf(task: { archivedAt: string | null }) {
    return (task.archivedAt === null ? 'active' : 'archived') satisfies TaskState;
}

export function isTaskState(value: unknown): value is TaskState {
    return taskStateOrder.includes(value as TaskState);
}
