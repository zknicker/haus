import { describe, expect, test } from 'bun:test';
import type { Task, TaskDetail } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { writeTaskResult } from './task-cache.ts';

const serverId = 'srv_1';
const now = '2026-11-04T12:00:00.000Z';

const allList = getQueryKey(hausTrpc.task.list, { serverId }, 'query');
const openList = getQueryKey(hausTrpc.task.listActive, { serverId }, 'query');
const detailByKey = getQueryKey(hausTrpc.task.get, { serverId, shortId: 'k3mq7xta' }, 'query');

describe('writeTaskResult', () => {
    test('writes the ack into lists and keeps the detail fields a list does not carry', () => {
        const queryClient = seed();
        writeTaskResult(queryClient, task('tsk_12', { title: 'Rotate keys', version: 3 }));

        expect(queryClient.getQueryData<Task[]>(allList)?.[0]?.title).toBe('Rotate keys');
        expect(queryClient.getQueryData<Task[]>(openList)?.[0]?.title).toBe('Rotate keys');
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)).toMatchObject({
            mentions: [],
            reminders: [],
            title: 'Rotate keys',
            version: 3,
        });
    });

    test('an edited description renders its own source until the detail refetches', () => {
        const queryClient = seed();
        writeTaskResult(
            queryClient,
            task('tsk_12', { description: 'Seen in #ops', title: 'Renamed', version: 3 })
        );
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)?.descriptionContent).toBe(
            'Seen in [#ops](chat://cht_ops)'
        );

        writeTaskResult(queryClient, task('tsk_12', { description: 'Now #infra', version: 4 }));
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)?.descriptionContent).toBe(
            'Now #infra'
        );
    });

    test('an ack older than a landed read does not overwrite it', () => {
        const queryClient = seed();
        writeTaskResult(queryClient, task('tsk_12', { title: 'Stale', version: 1 }));

        expect(queryClient.getQueryData<Task[]>(allList)?.[0]?.title).toBe('Task');
        expect(queryClient.getQueryData<TaskDetail>(detailByKey)?.title).toBe('Task');
    });
});

function seed() {
    const queryClient = new QueryClient();
    const tasks = [task('tsk_12'), task('tsk_13', { shortId: 'k3mq7xtb' })];
    queryClient.setQueryData(allList, tasks);
    queryClient.setQueryData(openList, tasks);
    const detail: TaskDetail = {
        ...task('tsk_12', { description: 'Seen in #ops' }),
        descriptionContent: 'Seen in [#ops](chat://cht_ops)',
        descriptionTaskLinks: [],
        followed: false,
        mentions: [],
        pullRequests: [],
        reminders: [],
        unreadCount: 0,
    };
    queryClient.setQueryData(detailByKey, detail);
    return queryClient;
}

function task(id: string, overrides: Partial<Task> = {}): Task {
    return {
        activity: 'idle',
        agentId: null,
        archivedAt: null,
        captainId: null,
        chatId: 'cht_task',
        computerId: null,
        createdAt: now,
        createdBy: { kind: 'user', userId: 'usr_1' },
        description: '',
        id,
        model: null,
        needsYou: false,
        origin: { chatId: 'cht_ops', messageId: 'msg_origin' },
        projectId: 'cht_ops',
        serverId,
        shortId: 'k3mq7xta',
        title: 'Task',
        titleCustom: false,
        updatedAt: now,
        version: 2,
        ...overrides,
    };
}
