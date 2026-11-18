import { expect, test } from 'bun:test';

import type { Task } from '@haus/api';

import { openTaskIds } from './open-task-order.ts';

const task = (id: string, key: string, state: Task['state'], createdAt: string) =>
    ({ createdAt, id, key, state }) as Task;

test('the sidebar lists only open Tasks, newest started first, ties by key', () => {
    const tasks = [
        task('t1', 'SEC-1', 'open', '2026-11-17T10:00:00.000Z'),
        task('t2', 'SEC-2', 'todo', '2026-11-17T12:00:00.000Z'),
        task('t3', 'OPS-4', 'open', '2026-11-17T11:00:00+01:00'),
        task('t4', 'SEC-3', 'done', '2026-11-17T13:00:00.000Z'),
        task('t5', 'SEC-5', 'canceled', '2026-11-17T13:00:00.000Z'),
        task('t6', 'APP-1', 'open', '2026-11-17T10:00:00.000Z'),
    ];
    expect(openTaskIds(tasks)).toEqual(['t6', 't3', 't1']);
});

test('a closed Task leaves even when its ack lands before the list refetch', () => {
    expect(openTaskIds([task('t1', 'SEC-1', 'done', '2026-11-17T10:00:00.000Z')])).toEqual([]);
});
