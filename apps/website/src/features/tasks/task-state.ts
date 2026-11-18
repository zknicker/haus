import { type TaskState, taskStates } from '@haus/api';
import type { ClaimStatus } from '../claims/claim-presentation.ts';

/** The four states in the order a menu or filter lists them (ADR 0053 decision 2). */
export const taskStateOrder: readonly TaskState[] = taskStates;

export const taskStateLabels: Record<TaskState, string> = {
    canceled: 'Canceled',
    done: 'Done',
    open: 'Open',
    todo: 'Todo',
};

/** The status disc each state wears: the claim glyphs, ring to check or cross. */
export const taskStateDiscs: Record<TaskState, ClaimStatus> = {
    canceled: 'closed',
    done: 'done',
    open: 'in_progress',
    todo: 'todo',
};

export function isTaskState(value: unknown): value is TaskState {
    return taskStateOrder.includes(value as TaskState);
}
