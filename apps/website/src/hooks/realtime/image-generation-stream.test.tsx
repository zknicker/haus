import { expect, test } from 'bun:test';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
} from '../../test-support/realtime-stream-harness.tsx';
import { useImageGenerationStream } from './use-image-generation-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const path = 'imageGeneration.onUpdated';

test('one update per linking Message refreshes exactly that Message entity', async () => {
    const harness = createRealtimeHarness();
    function Stream() {
        useImageGenerationStream(serverId);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    harness.ops.splice(0);

    const generation = { generationId: 'img_1', serverId };
    harness.emit(path, {
        ...generation,
        chatId: 'cht_a',
        messageId: 'msg_a',
        parentChatId: null,
    });
    harness.emit(path, {
        ...generation,
        chatId: 'cht_thread',
        messageId: 'msg_b',
        parentChatId: 'cht_a',
    });
    const ops = harness.ops.splice(0);
    await mounted.unmount();

    expect(ops).toEqual([
        {
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_a', messageId: 'msg_a', serverId },
        },
        {
            op: 'noteMessageAnnotated',
            target: { chatId: 'cht_thread', messageId: 'msg_b', serverId },
        },
    ]);
});
