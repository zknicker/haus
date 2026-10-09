import { afterAll, beforeAll, expect, test } from 'bun:test';
import { useChatMessages } from '../../../hooks/servers/use-chat-messages.ts';
import { installKeptChatViewTestDom } from '../../../test-support/kept-chat-views-harness.tsx';
import {
    agents,
    chat,
    createTranscriptHarness,
    history,
    installTranscriptBrowserStubs,
    message,
    serverId,
    viewerUserId,
} from '../../../test-support/transcript-render-harness.tsx';
import { ChatTranscript } from './chat-transcript.tsx';

// One message anywhere on a Server used to re-render every row of every kept
// transcript. Each test mounts two transcripts (the shown chat and a kept
// one), applies the cache change a realtime event causes, and asserts which
// transcript components rendered for it.

installKeptChatViewTestDom();
let restoreStubs: () => void;
beforeAll(() => {
    restoreStubs = installTranscriptBrowserStubs();
});
afterAll(() => restoreStubs());

const noArtifact = () => undefined;

/** What `ChatView` does with the transcript read, minus the chrome. */
function TranscriptView({ chatId }: { chatId: string }) {
    const messages = useChatMessages(serverId, chatId);
    return (
        <ChatTranscript
            chatId={chatId}
            messages={messages.data?.messages}
            onOpenArtifact={noArtifact}
            serverId={serverId}
            threads={messages.data?.threads}
            viewerUserId={viewerUserId}
        />
    );
}

async function mountTwoChats() {
    const harness = createTranscriptHarness();
    harness.setChats([chat('cht_a'), chat('cht_b')]);
    for (const chatId of ['cht_a', 'cht_b']) {
        harness.setMessages(chatId, history(chatId, 6));
        harness.setCloudAgentWork(chatId);
    }
    const view = await harness.mount(
        <>
            <TranscriptView chatId="cht_a" />
            <TranscriptView chatId="cht_b" />
        </>
    );
    return { ...harness, ...view };
}

test('a new message in a full newest page renders its own row and no other row', async () => {
    const harness = await mountTwoChats();
    // The newest page is a sliding window: the refetch drops the oldest row,
    // so every message lands at a new index, beside a different author.
    const census = await harness.change(() => {
        harness.setMessages('cht_a', [
            ...history('cht_a', 6).slice(1),
            message('cht_a', 7, 'agt_blippy'),
        ]);
    });

    expect(census.count('TranscriptRowSlot')).toBe(1);
    expect(census.count('TranscriptRowSlot', 'turn:msg_cht_a_7')).toBe(1);
    expect(census.count('TranscriptRenderRowView')).toBe(1);

    await harness.unmount();
});

test('a reordered chat list renders no transcript', async () => {
    const harness = await mountTwoChats();
    // A message anywhere moves its chat to the top of the activity-ordered list.
    const census = await harness.change(() => {
        harness.setChats([
            chat('cht_b', { lastActivityAt: '2026-10-09T12:00:00.000Z', unreadCount: 1 }),
            chat('cht_a'),
        ]);
    });

    expect(census.count('ChatTranscript')).toBe(0);
    expect(census.count('TranscriptRowSlot')).toBe(0);
    expect(census.count('TranscriptRenderRowView')).toBe(0);

    await harness.unmount();
});

test('an Agent availability flip renders no transcript', async () => {
    const harness = await mountTwoChats();
    const census = await harness.change(() => {
        harness.utils.agent.list.setData(
            { serverId },
            agents.map((agent) =>
                agent.id === 'agt_blippy' ? { ...agent, availability: 'working' } : agent
            )
        );
    });

    expect(census.count('ChatTranscript')).toBe(0);
    expect(census.count('TranscriptRowSlot')).toBe(0);
    expect(census.count('TranscriptRenderRowView')).toBe(0);

    await harness.unmount();
});

test('a background refetch and stale mark render no transcript', async () => {
    const harness = await mountTwoChats();
    // Realtime invalidation marks the read stale and refetches it; the
    // transport never answers, so the read stays fetching.
    const census = await harness.change(() => {
        void harness.utils.chat.messages.invalidate({ chatId: 'cht_a', serverId });
    });

    expect(census.count('TranscriptView')).toBe(0);
    expect(census.count('ChatTranscript')).toBe(0);

    await harness.unmount();
});
