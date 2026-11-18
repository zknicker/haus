import type { Task } from '@haus/api';

export function openTaskIds(tasks: readonly Task[]): string[] {
    return tasks
        .filter((task) => task.state === 'open')
        .sort(
            (a, b) =>
                Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.key.localeCompare(b.key)
        )
        .map((task) => task.id);
}
