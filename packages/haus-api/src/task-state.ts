import * as z from 'zod';

/**
 * A Task's state (ADR 0052 decision 2). `todo` is not started, `open` is being
 * worked, and `done` or `canceled` ends it. Posting in an ended Task reopens it.
 */
export const taskStates = ['todo', 'open', 'done', 'canceled'] as const;

export const taskStateSchema = z.enum(taskStates);

export type TaskState = z.infer<typeof taskStateSchema>;

/** The states that end a Task; the sidebar lists neither. */
export const closedTaskStates = ['done', 'canceled'] as const satisfies readonly TaskState[];

/** The states a Task is unfinished in: the default Agent list. */
export const unfinishedTaskStates = ['todo', 'open'] as const satisfies readonly TaskState[];

export function isClosedTaskState(state: TaskState): boolean {
    return (closedTaskStates as readonly TaskState[]).includes(state);
}
