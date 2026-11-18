import { type TaskState, taskStates } from '@haus/api';

import type { ClaimStatus } from '../claims/claim-presentation.ts';

export const taskStateOrder: readonly TaskState[] = taskStates;

export const taskStateLabels: Record<TaskState, string> = {
    canceled: 'Canceled',
    done: 'Done',
    open: 'Open',
    todo: 'Todo',
};

export const taskStateDiscs: Record<TaskState, ClaimStatus> = {
    canceled: 'closed',
    done: 'done',
    open: 'in_progress',
    todo: 'todo',
};

export function isTaskState(value: unknown): value is TaskState {
    return taskStateOrder.includes(value as TaskState);
}
