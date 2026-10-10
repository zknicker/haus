import { afterEach, describe, expect, test } from 'bun:test';
import { createTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useChatEngagement } from '../servers/use-chat-engagement.ts';
import { useChatThoughtListener } from '../servers/use-chat-thought-listener.ts';

installRealtimeTestDom();
// React Query notifies on a 0 ms timer: let it land while the fake DOM is still installed.
afterEach(() => new Promise((resolve) => setTimeout(resolve, 10)));

const serverId = 'srv_1';
const chatStreams = ['chat.onEngagement', 'chat.onThought'];

/** A chat view's per-Chat streams, as the typing indicator mounts them. */
function ChatStreams({ chatId }: { chatId: string | undefined }) {
    useChatEngagement(serverId, chatId);
    useChatThoughtListener(serverId, chatId, () => undefined);
    return null;
}

async function mountChat(chatId: string | undefined) {
    const harness = createRealtimeHarness(() => ({ engagements: [] }));
    const mounted = await harness.mount(<ChatStreams chatId={chatId} />);
    for (const path of chatStreams) {
        if (chatId !== undefined) {
            harness.start(path);
        }
    }
    return { harness, mounted };
}

describe('per-Chat stream lifecycle', () => {
    test('hiding a chat view stops its streams without scheduling a restart', async () => {
        const { harness, mounted } = await mountChat('cht_1');
        expect(harness.openPaths()).toEqual(chatStreams);

        // A tab switch hides the view: its streams drop their Chat.
        await mounted.render(<ChatStreams chatId={undefined} />);
        expect(harness.openPaths()).toEqual([]);
        expect(runRestarts()).toBe(0);

        await mounted.render(<ChatStreams chatId="cht_1" />);
        expect(harness.openPaths()).toEqual(chatStreams);
        await mounted.unmount();
        expect(runRestarts()).toBe(0);
        expect(harness.openPaths()).toEqual([]);
    });

    test('a Server completion still restarts the stream', async () => {
        const { harness, mounted } = await mountChat('cht_1');
        harness.complete('chat.onThought');
        expect(runRestarts()).toBe(1);
        expect(harness.openPaths()).toEqual(chatStreams);
        await mounted.unmount();
    });

    test('a deleted Chat stops its streams for good', async () => {
        const { harness, mounted } = await mountChat('cht_1');
        const coalescer = createTargetedReadCoalescer({
            client: harness.client,
            queryClient: harness.queryClient,
        });

        await harness.act(() => coalescer.purgeChat({ chatId: 'cht_1', serverId }));
        expect(harness.openPaths()).toEqual([]);
        expect(runRestarts()).toBe(0);
        expect(harness.openPaths()).toEqual([]);
        await mounted.unmount();
    });
});
