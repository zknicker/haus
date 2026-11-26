import { expect, test } from 'bun:test';
import type { Task } from '@haus/api';
import { isTaskState, taskStateLabels, taskStateOf, taskStateOrder } from './task-state.ts';
import {
    orderTasksForPage,
    readTaskView,
    taskAge,
    taskListFilters,
    tasksForView,
} from './tasks-page-model.ts';

const task = (
    shortId: string,
    createdAt: string,
    archivedAt: null | string = null,
    createdBy: Task['createdBy'] = { kind: 'user', userId: 'usr_ada' }
) => ({ archivedAt, createdAt, createdBy, shortId }) as unknown as Task;

test('a Task is active or archived, and nothing else passes for a state', () => {
    expect(taskStateOrder.map((state) => taskStateLabels[state])).toEqual(['Active', 'Archived']);
    expect(isTaskState('archived')).toBe(true);
    expect(isTaskState('open')).toBe(false);
    expect(taskStateOf({ archivedAt: null })).toBe('active');
    expect(taskStateOf({ archivedAt: '2026-11-10T00:00:00Z' })).toBe('archived');
});

test('the view tab reads back from the URL into the task.list input', () => {
    expect(readTaskView(new URLSearchParams())).toBe('mine');
    expect(readTaskView(new URLSearchParams('view=all'))).toBe('all');
    expect(readTaskView(new URLSearchParams('view=archived'))).toBe('archived');
    expect(readTaskView(new URLSearchParams('view=done'))).toBe('mine');
    expect(taskListFilters('archived')).toEqual({ archived: true });
    expect(taskListFilters('mine')).toEqual({});
    expect(taskListFilters('all')).toEqual({});
});

test('My tasks keeps the Tasks the reader started; All keeps every one', () => {
    const tasks = [
        task('aaaa0001', '2026-11-01T00:00:00Z'),
        task('aaaa0002', '2026-11-02T00:00:00Z', null, { agentId: 'agt_orbit', kind: 'agent' }),
        task('aaaa0003', '2026-11-03T00:00:00Z', null, { kind: 'user', userId: 'usr_kit' }),
    ];
    expect(tasksForView(tasks, 'mine', 'usr_ada').map((entry) => entry.shortId)).toEqual([
        'aaaa0001',
    ]);
    expect(tasksForView(tasks, 'all', 'usr_ada').map((entry) => entry.shortId)).toEqual([
        'aaaa0003',
        'aaaa0002',
        'aaaa0001',
    ]);
});

test('the flat list is newest first, by archive time once archived', () => {
    const ordered = orderTasksForPage([
        task('aaaa0001', '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'),
        task('aaaa0002', '2026-11-02T00:00:00Z'),
        task('aaaa0003', '2026-11-05T00:00:00Z'),
    ]);
    expect(ordered.map((entry) => entry.shortId)).toEqual(['aaaa0001', 'aaaa0003', 'aaaa0002']);
});

test('Tasks made at the same moment fall back to short id order', () => {
    const at = '2026-11-01T00:00:00Z';
    expect(
        orderTasksForPage([task('bbbb0002', at), task('aaaa0009', at)]).map(
            (entry) => entry.shortId
        )
    ).toEqual(['aaaa0009', 'bbbb0002']);
});

test('a row ages in the largest whole unit', () => {
    const now = Date.parse('2026-11-25T12:00:00Z');
    const age = (createdAt: string) => taskAge({ createdAt }, now);
    expect(age('2026-11-25T11:59:30Z')).toBe('now');
    expect(age('2026-11-25T11:15:00Z')).toBe('45m');
    expect(age('2026-11-25T02:00:00Z')).toBe('10h');
    expect(age('2026-11-22T12:00:00Z')).toBe('3d');
    expect(age('2026-11-04T12:00:00Z')).toBe('3w');
    expect(age('2026-08-25T12:00:00Z')).toBe('3mo');
    expect(age('2024-11-01T12:00:00Z')).toBe('2y');
});
