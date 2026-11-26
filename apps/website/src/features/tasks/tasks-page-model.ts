import type { Task } from '@haus/api';
import type { TaskListFilters } from '../../hooks/tasks/use-task-list.ts';
import { isTaskState, type TaskState, taskStateOf } from './task-state.ts';

export interface TasksPageFilters {
    state: null | TaskState;
}

export function readTasksPageFilters(params: URLSearchParams): TasksPageFilters {
    const state = params.get('state');
    return { state: isTaskState(state) ? state : null };
}

export function isFiltered(filters: TasksPageFilters) {
    return filters.state !== null;
}

export function taskListFilters(filters: TasksPageFilters): TaskListFilters {
    return filters.state === 'archived' ? { archived: true } : {};
}

export function orderTasksForPage(tasks: readonly Task[]) {
    return [...tasks].sort(
        (a, b) =>
            Date.parse(b.archivedAt ?? b.createdAt) - Date.parse(a.archivedAt ?? a.createdAt) ||
            a.shortId.localeCompare(b.shortId)
    );
}

export interface TaskStateGroup {
    state: TaskState;
    tasks: Task[];
}

export function groupTasksByState(ordered: readonly Task[]): TaskStateGroup[] {
    const groups: TaskStateGroup[] = [];
    for (const task of ordered) {
        const state = taskStateOf(task);
        const last = groups.at(-1);
        if (last?.state === state) {
            last.tasks.push(task);
        } else {
            groups.push({ state, tasks: [task] });
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
