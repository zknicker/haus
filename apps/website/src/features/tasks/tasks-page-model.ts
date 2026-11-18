import type { Task, TaskState } from '@haus/api';
import type { TaskListFilters } from '../../hooks/tasks/use-task-list.ts';
import { assigneeFilterFromKey } from './task-assignee.ts';
import { isTaskState } from './task-state.ts';

/** What the Tasks page narrows to, as its URL carries it. Null keeps everything. */
export interface TasksPageFilters {
    /** An `assigneeKey`, `none` included. */
    assignee: null | string;
    keyId: null | string;
    /** Narrowed here, not by `task.list`, which takes no label. */
    labelId: null | string;
    state: null | TaskState;
}

export function readTasksPageFilters(params: URLSearchParams): TasksPageFilters {
    const state = params.get('state');
    return {
        assignee: params.get('assignee'),
        keyId: params.get('key'),
        labelId: params.get('label'),
        state: isTaskState(state) ? state : null,
    };
}

export function isFiltered(filters: TasksPageFilters): boolean {
    return Object.values(filters).some((value) => value !== null);
}

/** The `task.list` input for the page's filters; with no state chosen it reads all four. */
export function taskListFilters(filters: Omit<TasksPageFilters, 'labelId'>): TaskListFilters {
    return {
        ...(filters.assignee === null ? {} : { assignee: assigneeFilterFromKey(filters.assignee) }),
        ...(filters.keyId === null ? {} : { keyId: filters.keyId }),
        ...(filters.state === null ? {} : { states: [filters.state] }),
    };
}

const stateRank: Record<TaskState, number> = { canceled: 3, done: 2, open: 0, todo: 1 };

/**
 * One flat list: the label filter applied, then open work first, then todo,
 * then done and canceled. Live Tasks read newest first; ended ones by when
 * they ended, newest first.
 */
export function orderTasksForPage(tasks: readonly Task[], labelId: null | string = null): Task[] {
    return tasks
        .filter((task) => labelId === null || task.labelIds.includes(labelId))
        .sort(
            (a, b) =>
                stateRank[a.state] - stateRank[b.state] ||
                Date.parse(b.completedAt ?? b.createdAt) -
                    Date.parse(a.completedAt ?? a.createdAt) ||
                a.key.localeCompare(b.key)
        );
}
