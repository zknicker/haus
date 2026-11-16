import { describe, expect, test } from 'bun:test';
import type { BoardColumn, Task, TaskDetail } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { moveTaskInCache, writeTaskResult } from './task-cache.ts';

const serverId = 'srv_1';
const boardId = 'brd_sec';
const now = '2026-11-04T12:00:00.000Z';
const todo = column('col_todo', 'todo');
const active = column('col_active', 'active');
const done = column('col_done', 'done');
const canceled = column('col_canceled', 'canceled');

const boardList = getQueryKey(hausTrpc.task.list, { boardId, serverId }, 'query');
const openList = getQueryKey(
    hausTrpc.task.list,
    { boardId, categories: ['backlog', 'todo', 'active'], serverId },
    'query'
);
const detailByKey = getQueryKey(hausTrpc.task.get, { key: 'SEC-12', serverId }, 'query');

describe('moveTaskInCache', () => {
    test('moves the Task in every read and bumps the version the Server will', () => {
        const queryClient = seed();
        moveTaskInCache(queryClient, { column: active, serverId, taskId: 'tsk_12' }, now);

        const moved = { category: 'active', columnId: 'col_active', version: 3 };
        expect(queryClient.getQueryData<Task[]>(boardList)?.[0]).toMatchObject(moved);
        expect(queryClient.getQueryData<Task[]>(openList)?.[0]).toMatchObject(moved);
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)).toMatchObject(moved);
    });

    test('sets completedAt entering a closed column and keeps it closed to closed', () => {
        const queryClient = seed();
        moveTaskInCache(queryClient, { column: done, serverId, taskId: 'tsk_12' }, now);
        expect(queryClient.getQueryData<Task[]>(boardList)?.[0]?.completedAt).toBe(now);

        moveTaskInCache(
            queryClient,
            { column: canceled, serverId, taskId: 'tsk_12' },
            '2026-11-05T12:00:00.000Z'
        );
        expect(queryClient.getQueryData<Task[]>(boardList)?.[0]?.completedAt).toBe(now);

        moveTaskInCache(queryClient, { column: todo, serverId, taskId: 'tsk_12' }, now);
        expect(queryClient.getQueryData<Task[]>(boardList)?.[0]?.completedAt).toBeNull();
    });

    test('a list filtered away from the destination drops the Task, and undo restores its place', () => {
        const queryClient = seed();
        const before = queryClient.getQueryData<Task[]>(openList);
        const undo = moveTaskInCache(
            queryClient,
            { column: done, serverId, taskId: 'tsk_12' },
            now
        );
        expect(queryClient.getQueryData<Task[]>(openList)?.map((task) => task.id)).toEqual([
            'tsk_13',
        ]);

        undo();
        expect(queryClient.getQueryData<Task[]>(openList)).toEqual(before);
        expect(queryClient.getQueryData<Task[]>(boardList)?.[0]).toMatchObject({
            columnId: 'col_todo',
            version: 2,
        });
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)?.columnId).toBe('col_todo');
    });

    test('undo leaves another Task moved meanwhile alone', () => {
        const queryClient = seed();
        const undo = moveTaskInCache(
            queryClient,
            { column: done, serverId, taskId: 'tsk_12' },
            now
        );
        moveTaskInCache(queryClient, { column: active, serverId, taskId: 'tsk_13' }, now);

        undo();
        expect(queryClient.getQueryData<Task[]>(boardList)?.map((task) => task.columnId)).toEqual([
            'col_todo',
            'col_active',
        ]);
    });

    test('moving to the current column changes nothing, as on the Server', () => {
        const queryClient = seed();
        const before = queryClient.getQueryData<Task[]>(boardList);
        moveTaskInCache(queryClient, { column: todo, serverId, taskId: 'tsk_12' }, now);
        expect(queryClient.getQueryData<Task[]>(boardList)).toBe(before);
    });
});

describe('writeTaskResult', () => {
    test('writes the ack into lists and keeps the detail fields a list does not carry', () => {
        const queryClient = seed();
        writeTaskResult(queryClient, task('tsk_12', { title: 'Rotate keys', version: 3 }));

        expect(queryClient.getQueryData<Task[]>(boardList)?.[0]?.title).toBe('Rotate keys');
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)).toMatchObject({
            mentions: [],
            reminders: [],
            title: 'Rotate keys',
            version: 3,
        });
    });

    test('an ack older than a landed read does not overwrite it', () => {
        const queryClient = seed();
        writeTaskResult(queryClient, task('tsk_12', { title: 'Stale', version: 1 }));

        expect(queryClient.getQueryData<Task[]>(boardList)?.[0]?.title).toBe('Task');
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)?.title).toBe('Task');
    });
});

function seed() {
    const queryClient = new QueryClient();
    const tasks = [task('tsk_12'), task('tsk_13', { key: 'SEC-13', number: 13 })];
    queryClient.setQueryData(boardList, tasks);
    queryClient.setQueryData(openList, tasks);
    queryClient.setQueryData(detailByKey, { ...task('tsk_12'), mentions: [], reminders: [] });
    return queryClient;
}

function column(id: string, category: BoardColumn['category']): BoardColumn {
    return { category, id, name: id, position: 0 };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
    return {
        assignee: null,
        boardId,
        category: 'todo',
        columnId: 'col_todo',
        completedAt: null,
        createdAt: now,
        createdBy: { kind: 'user', userId: 'usr_1' },
        description: '',
        dueOn: null,
        id,
        key: 'SEC-12',
        labelIds: [],
        number: 12,
        priority: 'none',
        serverId,
        title: 'Task',
        updatedAt: now,
        version: 2,
        ...overrides,
    };
}
