import { expect, test } from 'bun:test';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
} from '../../test-support/realtime-stream-harness.tsx';
import { useCloudAgentWorkStream } from './use-cloud-agent-work-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const path = 'cloudAgentWork.onUpdated';

test('one update per linking Message refreshes each Message and its own Chat lists', async () => {
    const harness = createRealtimeHarness();
    function Stream() {
        useCloudAgentWorkStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);

    // The Server fans one lifecycle change out to every linking Message (ADR 0044).
    const work = { serverId, taskId: null, workId: 'caw_1' };
    harness.emit(path, {
        ...work,
        chatId: 'cht_launch',
        messageId: 'msg_launch',
    });
    harness.emit(path, {
        ...work,
        chatId: 'cht_task',
        messageId: 'msg_link',
    });
    const ops = harness.ops.splice(0);
    await mounted.unmount();

    expect(ops.filter((entry) => entry.op === 'noteMessageAnnotated')).toEqual([
        {
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_launch', messageId: 'msg_launch', serverId },
        },
        {
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_task', messageId: 'msg_link', serverId },
        },
    ]);
    const lists = invalidated(ops).map((entry) => entry.input);
    for (const chatId of ['cht_launch', 'cht_task']) {
        expect(lists).toContainEqual({ chatId, serverId });
    }
    expect(lists).toContainEqual({ serverId });
    expect(invalidated(ops).filter((entry) => entry.path === 'task.get')).toEqual([]);
});

test('an update naming a Task refreshes exactly that Task, by key and by id', async () => {
    const harness = createRealtimeHarness();
    const seed = (address: Record<string, string>, id: string) =>
        harness.queryClient.setQueryData(
            getQueryKey(hausTrpc.task.get, { ...address, serverId } as never, 'query'),
            { attachedWork: [], id }
        );
    seed({ key: 'SEC-12' }, 'tsk_12');
    seed({ taskId: 'tsk_12' }, 'tsk_12');
    seed({ key: 'SEC-13' }, 'tsk_13');
    function Stream() {
        useCloudAgentWorkStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);

    // The work was just launched, so no cached detail lists it yet.
    harness.emit(path, {
        chatId: 'cht_task',
        messageId: 'msg_launch',
        serverId,
        taskId: 'tsk_12',
        workId: 'caw_new',
    });
    const ops = harness.ops.splice(0);
    await mounted.unmount();

    expect(invalidated(ops).filter((entry) => entry.path === 'task.get')).toEqual([
        { input: { key: 'SEC-12', serverId }, path: 'task.get' },
        { input: { serverId, taskId: 'tsk_12' }, path: 'task.get' },
    ]);
});
