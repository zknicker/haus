import { expect, test } from 'bun:test';
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
    const work = { serverId, workId: 'caw_1' };
    harness.emit(path, {
        ...work,
        chatId: 'cht_launch',
        messageId: 'msg_launch',
        parentChatId: null,
    });
    harness.emit(path, {
        ...work,
        chatId: 'cht_thread',
        messageId: 'msg_link',
        parentChatId: 'cht_ops',
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
            target: { chatId: 'cht_thread', messageId: 'msg_link', serverId },
        },
    ]);
    const lists = invalidated(ops).map((entry) => entry.input);
    for (const chatId of ['cht_launch', 'cht_thread', 'cht_ops']) {
        expect(lists).toContainEqual({ chatId, serverId });
    }
    expect(lists).toContainEqual({ serverId });
});
