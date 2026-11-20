import { expect, test } from 'bun:test';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
} from '../../test-support/realtime-stream-harness.tsx';
import { useWorkerStream } from './use-worker-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const path = 'worker.onUpdated';

test('an update refreshes that Worker and the active lists, and annotates no Message', async () => {
    const harness = createRealtimeHarness();
    function Stream() {
        useWorkerStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);

    harness.emit(path, { chatId: 'cht_task', serverId, taskId: 'tsk_1', workerId: 'wkr_1' });
    const ops = harness.ops.splice(0);
    await mounted.unmount();

    expect(ops.filter((entry) => entry.op === 'noteMessageAnnotated')).toEqual([]);
    expect(invalidated(ops).filter((entry) => entry.path === 'worker.get')).toEqual([
        { input: { serverId, workerId: 'wkr_1' }, path: 'worker.get' },
    ]);
    expect(invalidated(ops).map((entry) => entry.input)).toContainEqual({ serverId });
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
        useWorkerStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);

    harness.emit(path, {
        chatId: 'cht_task',
        serverId,
        taskId: 'tsk_12',
        workerId: 'caw_new',
    });
    const ops = harness.ops.splice(0);
    await mounted.unmount();

    expect(invalidated(ops).filter((entry) => entry.path === 'task.get')).toEqual([
        { input: { key: 'SEC-12', serverId }, path: 'task.get' },
        { input: { serverId, taskId: 'tsk_12' }, path: 'task.get' },
    ]);
});
