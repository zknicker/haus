import { describe, expect, test } from 'bun:test';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useBoardUpdateStream } from './use-board-update-stream.ts';
import { useTaskCreatedStream } from './use-task-created-stream.ts';
import { useTaskInboxStream } from './use-task-inbox-stream.ts';
import { useTaskUpdatedStream } from './use-task-updated-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const boardId = 'brd_sec';
const event = { boardId, serverId, taskId: 'tsk_12', version: 3 };
const read = (path: string, input?: Record<string, unknown>) => ({ input, path });

/** `task.get` reads cached by key and by id, with one Task of another board beside them. */
function seedDetails(harness: ReturnType<typeof createRealtimeHarness>) {
    const seed = (address: Record<string, string>, id: string, board: string) =>
        harness.queryClient.setQueryData(
            getQueryKey(hausTrpc.task.get, { ...address, serverId } as never, 'query'),
            { boardId: board, id }
        );
    seed({ key: 'SEC-12' }, 'tsk_12', boardId);
    seed({ taskId: 'tsk_12' }, 'tsk_12', boardId);
    seed({ key: 'SEC-13' }, 'tsk_13', boardId);
    seed({ key: 'OPS-1' }, 'tsk_ops', 'brd_ops');
}

/** Event ops, then the ops of a restart after a completion (owned reads only). */
async function drive(path: string, useStream: () => void, payload: unknown) {
    const harness = createRealtimeHarness();
    seedDetails(harness);
    function Stream() {
        useStream();
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);
    harness.emit(path, payload);
    const onEvent = invalidated(harness.ops.splice(0));
    harness.complete(path);
    expect(runRestarts()).toBe(1);
    harness.start(path);
    const onRecovery = invalidated(harness.ops.splice(0));
    await mounted.unmount();
    return { onEvent, onRecovery };
}

describe('board and Task stream hooks', () => {
    test('task.onCreated refreshes that board and the open count', async () => {
        const { onEvent, onRecovery } = await drive(
            'task.onCreated',
            () => useTaskCreatedStream(serverId),
            event
        );
        expect(onEvent).toEqual([
            read('task.list', { boardId, serverId }),
            read('board.list', { serverId }),
        ]);
        expect(onRecovery).toEqual([
            read('task.list', { serverId }),
            read('board.list', { serverId }),
        ]);
    });

    test('task.onUpdated refreshes that Task by key and by id, never its neighbors', async () => {
        const { onEvent, onRecovery } = await drive(
            'task.onUpdated',
            () => useTaskUpdatedStream(serverId),
            event
        );
        expect(onEvent).toHaveLength(5);
        expect(onEvent).toEqual(
            expect.arrayContaining([
                read('task.list', { boardId, serverId }),
                read('task.get', { key: 'SEC-12', serverId }),
                read('task.get', { serverId, taskId: 'tsk_12' }),
                read('board.list', { serverId }),
                read('taskInbox.list', { serverId }),
            ])
        );
        expect(onRecovery).toEqual([
            read('task.list', { serverId }),
            read('task.get', { serverId }),
            read('board.list', { serverId }),
            read('taskInbox.list', { serverId }),
        ]);
    });

    test('board.onUpdated refreshes that board and its Tasks, not another board', async () => {
        const { onEvent, onRecovery } = await drive(
            'board.onUpdated',
            () => useBoardUpdateStream(serverId),
            { boardId, serverId, version: 2 }
        );
        expect(onEvent).toHaveLength(6);
        expect(onEvent).toEqual(
            expect.arrayContaining([
                read('task.list', { boardId, serverId }),
                read('task.get', { key: 'SEC-12', serverId }),
                read('task.get', { serverId, taskId: 'tsk_12' }),
                read('task.get', { key: 'SEC-13', serverId }),
                read('board.list', { serverId }),
                read('taskInbox.list', { serverId }),
            ])
        );
        expect(onRecovery).toEqual([
            read('task.list', { serverId }),
            read('task.get', { serverId }),
            read('board.list', { serverId }),
            read('taskInbox.list', { serverId }),
        ]);
    });

    test('taskInbox.onChanged refreshes the item list', async () => {
        const { onEvent, onRecovery } = await drive(
            'taskInbox.onChanged',
            () => useTaskInboxStream(serverId),
            { serverId, userId: 'usr_1' }
        );
        expect(onEvent).toEqual([read('taskInbox.list', { serverId })]);
        expect(onRecovery).toEqual(onEvent);
    });
});
