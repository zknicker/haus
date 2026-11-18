import type { Task } from '@haus/api';

/**
 * The sidebar's open Tasks, newest first by when they started, then by key:
 * a row holds its place while the Task is worked, since edits and state
 * changes never reorder it. Only `open` Tasks are listed (ADR 0053 decision 8);
 * a list that still holds a closed or todo one (an ack ahead of its event)
 * leaves it out.
 */
export function openTaskIds(tasks: readonly Task[]): string[] {
    return tasks
        .filter((task) => task.state === 'open')
        .sort(
            (a, b) =>
                Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.key.localeCompare(b.key)
        )
        .map((task) => task.id);
}
