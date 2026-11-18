import { describe, expect, test } from 'bun:test';

import { getQueryKey } from '@trpc/react-query';

import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useTaskCreatedStream } from './use-task-created-stream.ts';
import { useTaskFollowStream } from './use-task-follow-stream.ts';
import { useTaskUpdatedStream } from './use-task-updated-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const origin = { chatId: 'cht_ops', messageId: 'msg_origin' };
const event = { chatId: 'cht_task', serverId, taskId: 'tsk_12', version: 3 };
const read = (path: string, input?: Record<string, unknown>) => ({ input, path });

function seedDetails(harness: ReturnType<typeof createRealtimeHarness>) {
    const seed = (address: Record<string, string>, id: string) =>
        harness.queryClient.setQueryData(
            getQueryKey(hausTrpc.task.get, { ...address, serverId } as never, 'query'),
            { id, origin }
        );
    seed({ key: 'SEC-12' }, 'tsk_12');
    seed({ taskId: 'tsk_12' }, 'tsk_12');
    seed({ key: 'SEC-13' }, 'tsk_13');
}

function seedTranscript(harness: ReturnType<typeof createRealtimeHarness>) {
    harness.queryClient.setQueryData(
        getQueryKey(
            hausTrpc.chat.messages,
            { chatId: origin.chatId, limit: 50, serverId },
            'infinite'
        ),
        { pageParams: [], pages: [] }
    );
}

/** Event ops, then the ops of a restart after a completion (owned reads only). */
async function drive(
    path: string,
    useStream: () => void,
    payload: unknown,
    harness = createRealtimeHarness()
) {
    seedDetails(harness);
    function Stream() {
        useStream();
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);
    harness.emit(path, payload);
    await harness.act(() => Bun.sleep(0));
    const eventOps = harness.ops.splice(0);
    harness.complete(path);
    expect(runRestarts()).toBe(1);
    harness.start(path);
    const onRecovery = invalidated(harness.ops.splice(0));
    await mounted.unmount();
    return { eventOps, onEvent: invalidated(eventOps), onRecovery };
}

describe('Task stream hooks', () => {
    test('task.onCreated refreshes the Tasks page and the sidebar', async () => {
        const { eventOps, onEvent, onRecovery } = await drive(
            'task.onCreated',
            () => useTaskCreatedStream(serverId),
            event
        );
        const lists = [read('task.list', { serverId }), read('task.listOpen', { serverId })];
        expect(onEvent).toEqual(lists);
        expect(onRecovery).toEqual(lists);
        expect(eventOps.some((op) => op.op === 'noteMessageAnnotated')).toBe(false);
    });

    test('task.onCreated refreshes the origin Message, so its preview shows before any reply', async () => {
        const harness = createRealtimeHarness();
        seedTranscript(harness);
        const { eventOps } = await drive(
            'task.onCreated',
            () => useTaskCreatedStream(serverId),
            event,
            harness
        );
        expect(eventOps).toContainEqual({
            op: 'noteMessageAnnotated',
            target: { ...origin, serverId },
        });
        expect(harness.reads).not.toContain('task.get');
    });

    test('task.onCreated reads an uncached Task to find its origin', async () => {
        const harness = createRealtimeHarness((path) =>
            path === 'task.get' ? { id: 'tsk_new', origin } : null
        );
        seedTranscript(harness);
        const { eventOps } = await drive(
            'task.onCreated',
            () => useTaskCreatedStream(serverId),
            { ...event, taskId: 'tsk_new' },
            harness
        );
        expect(harness.reads).toContain('task.get');
        expect(eventOps).toContainEqual({
            op: 'noteMessageAnnotated',
            target: { ...origin, serverId },
        });
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
                read('task.get', { key: 'SEC-12', serverId }),
                read('task.get', { serverId, taskId: 'tsk_12' }),
                read('task.list', { serverId }),
                read('task.listOpen', { serverId }),
                read('chat.unreadPreviews', { serverId }),
            ])
        );
        expect(onRecovery).toEqual([
            read('task.get', { serverId }),
            read('task.list', { serverId }),
            read('task.listOpen', { serverId }),
            read('chat.unreadPreviews', { serverId }),
        ]);
    });

    test('task.onFollowUpdated refreshes that Task and the unread rows', async () => {
        const { onEvent, onRecovery } = await drive(
            'task.onFollowUpdated',
            () => useTaskFollowStream(serverId),
            { chatId: 'cht_task', followed: false, serverId, taskId: 'tsk_12' }
        );
        expect(onEvent).toEqual([
            read('task.get', { key: 'SEC-12', serverId }),
            read('task.get', { serverId, taskId: 'tsk_12' }),
            read('chat.unreadPreviews', { serverId }),
        ]);
        expect(onRecovery).toEqual([
            read('task.get', { serverId }),
            read('chat.unreadPreviews', { serverId }),
        ]);
    });
});
