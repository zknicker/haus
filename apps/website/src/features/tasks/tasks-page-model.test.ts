import { expect, test } from 'bun:test';

import type { Task } from '@haus/api';

import { assigneeFilterFromKey, assigneeFromKey, assigneeKey } from './task-assignee.ts';
import { isTaskState, taskStateLabels, taskStateOrder } from './task-state.ts';
import {
    isFiltered,
    orderTasksForPage,
    readTasksPageFilters,
    taskListFilters,
} from './tasks-page-model.ts';

test('every state has a label, and nothing else passes for a state', () => {
    expect(taskStateOrder.map((state) => taskStateLabels[state])).toEqual([
        'Todo',
        'Open',
        'Done',
        'Canceled',
    ]);
    expect(isTaskState('open')).toBe(true);
    expect(isTaskState('active')).toBe(false);
    expect(isTaskState(null)).toBe(false);
});

test('the URL filters read back into the task.list input', () => {
    const filters = readTasksPageFilters(
        new URLSearchParams('state=done&key=tkk_sec&assignee=agent:agt_forge&label=lbl_bug')
    );
    expect(filters).toEqual({
        assignee: 'agent:agt_forge',
        keyId: 'tkk_sec',
        labelId: 'lbl_bug',
        state: 'done',
    });
    expect(isFiltered(filters)).toBe(true);
    expect(isFiltered(readTasksPageFilters(new URLSearchParams()))).toBe(false);
    expect(isFiltered(readTasksPageFilters(new URLSearchParams('label=lbl_bug')))).toBe(true);
    expect(taskListFilters(filters)).toEqual({
        assignee: { agentId: 'agt_forge' },
        keyId: 'tkk_sec',
        states: ['done'],
    });
    expect(taskListFilters(readTasksPageFilters(new URLSearchParams('state=active')))).toEqual({});
    expect(taskListFilters({ assignee: 'none', keyId: null, state: null })).toEqual({
        assignee: 'none',
    });
});

test('assignee keys round-trip and narrow to the list filter', () => {
    for (const assignee of [
        { agentId: 'agt_1', kind: 'agent' } as const,
        { kind: 'user', userId: 'usr_1' } as const,
        null,
    ]) {
        expect(assigneeFromKey(assigneeKey(assignee))).toEqual(assignee);
    }
    expect(assigneeFilterFromKey('user:usr_1')).toEqual({ userId: 'usr_1' });
});

test('the flat list leads with open work, then todo, then what ended, newest first', () => {
    const task = (key: string, state: Task['state'], createdAt: string, completedAt?: string) =>
        ({
            completedAt: completedAt ?? null,
            createdAt,
            key,
            labelIds: [],
            state,
        }) as unknown as Task;
    const ordered = orderTasksForPage([
        task('SEC-1', 'done', '2026-11-01T00:00:00Z', '2026-11-10T00:00:00Z'),
        task('SEC-2', 'todo', '2026-11-02T00:00:00Z'),
        task('SEC-3', 'open', '2026-11-03T00:00:00Z'),
        task('SEC-4', 'canceled', '2026-11-04T00:00:00Z', '2026-11-05T00:00:00Z'),
        task('SEC-5', 'open', '2026-11-05T00:00:00Z'),
        task('SEC-6', 'done', '2026-11-06T00:00:00Z', '2026-11-07T00:00:00Z'),
    ]);
    expect(ordered.map((entry) => entry.key)).toEqual([
        'SEC-5',
        'SEC-3',
        'SEC-2',
        'SEC-1',
        'SEC-6',
        'SEC-4',
    ]);
});

test('a label narrows the flat list to the Tasks carrying it', () => {
    const task = (key: string, labelIds: string[]) =>
        ({
            completedAt: null,
            createdAt: '2026-11-01T00:00:00Z',
            key,
            labelIds,
            state: 'open',
        }) as unknown as Task;
    const tasks = [
        task('SEC-1', ['lbl_bug']),
        task('SEC-2', []),
        task('SEC-3', ['lbl_ui', 'lbl_bug']),
    ];
    expect(orderTasksForPage(tasks, 'lbl_bug').map((entry) => entry.key)).toEqual([
        'SEC-1',
        'SEC-3',
    ]);
    expect(orderTasksForPage(tasks)).toHaveLength(3);
});
