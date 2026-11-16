import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Board, Task } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { getQueryKey } from '@trpc/react-query';
import { type Observer, observable } from '@trpc/server/observable';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { useMoveTask } from './use-move-task.ts';

const serverId = 'srv_1';
const boardId = 'brd_sec';
const now = '2026-11-04T12:00:00.000Z';
const list = getQueryKey(hausTrpc.task.list, { boardId, serverId }, 'query');
const moveInput = { columnId: 'col_active', expectedVersion: 2, serverId, taskId: 'tsk_12' };

let restoreDom: () => void = () => undefined;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

describe('useMoveTask', () => {
    test('moves the card before the Server answers and keeps the ack', async () => {
        const harness = await mountMove();
        await harness.move();

        expect(harness.task()).toMatchObject({ columnId: 'col_active', version: 3 });
        expect(harness.sent()).toEqual(moveInput);

        await harness.answer({
            task: seedTask({ columnId: 'col_active', title: 'Acked', version: 3 }),
        });
        expect(harness.task()).toMatchObject({ title: 'Acked', version: 3 });
        await harness.unmount();
    });

    test('a conflict puts the card back and re-reads the list', async () => {
        const harness = await mountMove();
        await harness.move();
        expect(harness.task()?.columnId).toBe('col_active');

        await harness.refuse('CONFLICT');
        expect(harness.task()).toMatchObject({ columnId: 'col_todo', version: 2 });
        expect(harness.queryClient.getQueryState(list)?.isInvalidated).toBe(true);
        await harness.unmount();
    });

    test('moves run one at a time, so a second drag meets the version the first left', async () => {
        const harness = await mountMove();
        await harness.move();
        await harness.move({ columnId: 'col_todo', expectedVersion: 3 });
        expect(harness.sends()).toBe(1);

        await harness.answer({ task: seedTask({ columnId: 'col_active', version: 3 }) });
        expect(harness.sends()).toBe(2);
        await harness.unmount();
    });
});

/** Mounts the hook over a transport that holds each mutation until the test answers it. */
async function mountMove() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(getQueryKey(hausTrpc.board.list, { serverId }, 'query'), [
        seedBoard(),
    ]);
    queryClient.setQueryData(list, [seedTask()]);
    const held: { input: unknown; observer: Observer<unknown, unknown> }[] = [];
    let answered = 0;
    const client = hausTrpc.createClient({
        links: [
            () =>
                ({ op }) =>
                    observable((observer) => {
                        held.push({
                            input: op.input,
                            observer: observer as Observer<unknown, unknown>,
                        });
                        return () => undefined;
                    }),
        ],
    });
    let mutation: ReturnType<typeof useMoveTask> | undefined;
    function Probe() {
        mutation = useMoveTask();
        return null;
    }
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(document.createElement('div'));
    await React.act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    <Probe />
                </hausTrpc.Provider>
            </QueryClientProvider>
        );
    });
    const settle = () => React.act(() => Bun.sleep(5));
    const next = () => {
        const entry = held[answered];
        answered += 1;
        if (!entry) {
            throw new Error('No move is waiting on the Server.');
        }
        return entry.observer;
    };

    return {
        answer: async (data: unknown) => {
            const observer = next();
            observer.next({ result: { data } });
            observer.complete();
            await settle();
        },
        move: async (overrides: Partial<typeof moveInput> = {}) => {
            mutation?.mutate({ ...moveInput, ...overrides });
            await settle();
        },
        queryClient,
        refuse: async (code: string) => {
            next().error(
                TRPCClientError.from({ error: { code: -32_000, data: { code }, message: code } })
            );
            await settle();
        },
        sends: () => held.length,
        sent: () => held[0]?.input,
        task: () => queryClient.getQueryData<Task[]>(list)?.[0],
        unmount: () => React.act(() => root.unmount()),
    };
}

function seedBoard(): Board {
    return {
        archivedAt: null,
        columns: [
            { category: 'todo', id: 'col_todo', name: 'Todo', position: 0 },
            { category: 'active', id: 'col_active', name: 'In progress', position: 1 },
        ],
        createdAt: now,
        id: boardId,
        key: 'SEC',
        name: 'Security',
        openTaskCount: 1,
        serverId,
        updatedAt: now,
        version: 1,
    };
}

function seedTask(overrides: Partial<Task> = {}): Task {
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
        id: 'tsk_12',
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
