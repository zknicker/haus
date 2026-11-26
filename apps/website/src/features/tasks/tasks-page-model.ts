import type { Task } from '@haus/api';
import type { TaskListFilters } from '../../hooks/tasks/use-task-list.ts';

export const taskViews = [
    { id: 'mine', label: 'My tasks' },
    { id: 'all', label: 'All tasks' },
    { id: 'archived', label: 'Archived' },
] as const;

export type TaskView = (typeof taskViews)[number]['id'];

export function readTaskView(params: URLSearchParams): TaskView {
    const view = params.get('view');
    return taskViews.some((entry) => entry.id === view) ? (view as TaskView) : 'mine';
}

export function taskListFilters(view: TaskView): TaskListFilters {
    return view === 'archived' ? { archived: true } : {};
}

export function tasksForView(tasks: readonly Task[], view: TaskView, viewerUserId: null | string) {
    const shown =
        view === 'mine'
            ? tasks.filter(
                  (task) => task.createdBy.kind === 'user' && task.createdBy.userId === viewerUserId
              )
            : tasks;
    return orderTasksForPage(shown);
}

export function orderTasksForPage(tasks: readonly Task[]) {
    return [...tasks].sort(
        (a, b) =>
            Date.parse(b.archivedAt ?? b.createdAt) - Date.parse(a.archivedAt ?? a.createdAt) ||
            a.shortId.localeCompare(b.shortId)
    );
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
