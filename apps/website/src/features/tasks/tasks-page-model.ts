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
                a.key.localeCompare(b.key, undefined, { numeric: true })
        );
}

export interface TaskStateGroup {
    state: TaskState;
    tasks: Task[];
}

export function groupTasksByState(ordered: readonly Task[]): TaskStateGroup[] {
    const groups: TaskStateGroup[] = [];
    for (const task of ordered) {
        const last = groups.at(-1);
        if (last?.state === task.state) {
            last.tasks.push(task);
        } else {
            groups.push({ state: task.state, tasks: [task] });
        }
    }
    return groups;
}

export function taskAge(task: Pick<Task, 'createdAt'>, now: number) {
    const minutes = Math.max(0, Math.floor((now - Date.parse(task.createdAt)) / 60_000));
    if (minutes < 1) {
        return 'now';
    }
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
        return `${days}d`;
    }
    if (days < 30) {
        return `${Math.floor(days / 7)}w`;
    }
    return days < 365 ? `${Math.floor(days / 30)}mo` : `${Math.floor(days / 365)}y`;
}
