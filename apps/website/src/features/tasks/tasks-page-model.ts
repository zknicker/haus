import type { Task, TaskState } from '@haus/api';
import type { TaskListFilters } from '../../hooks/tasks/use-task-list.ts';
import { assigneeFilterFromKey } from './task-assignee.ts';
import { isTaskState } from './task-state.ts';

export interface TasksPageFilters {
    assignee: null | string;
    keyId: null | string;
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

export function taskListFilters(filters: Omit<TasksPageFilters, 'labelId'>): TaskListFilters {
    return {
        ...(filters.assignee === null ? {} : { assignee: assigneeFilterFromKey(filters.assignee) }),
        ...(filters.keyId === null ? {} : { keyId: filters.keyId }),
        ...(filters.state === null ? {} : { states: [filters.state] }),
    };
}

const stateRank: Record<TaskState, number> = { canceled: 3, done: 2, open: 0, todo: 1 };

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
