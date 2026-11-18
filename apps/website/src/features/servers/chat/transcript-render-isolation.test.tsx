import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { QueryClient } from '@tanstack/react-query';
import { isChatMessageEntityOf } from '../../../hooks/servers/chat-message-entities.ts';
import { ChatMessageSubscriptionContext } from '../../../hooks/servers/use-chat-message.ts';
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
            messages={messages.data?.entries}
            onOpenArtifact={noArtifact}
            serverId={serverId}
            viewerUserId={viewerUserId}
        />
    );
}

/** Mounts cht_a and cht_b; `hidden` renders cht_a the way a hidden kept view does. */
async function mountTwoChats({ hidden = false }: { hidden?: boolean } = {}) {
    const harness = createTranscriptHarness();
    harness.setChats([chat('cht_a'), chat('cht_b')]);
    for (const chatId of ['cht_a', 'cht_b']) {
        harness.setMessages(chatId, history(chatId, 6));
        harness.setCloudAgentWork(chatId);
    }
    const view = await harness.mount(
        <>
            <ChatMessageSubscriptionContext value={!hidden}>
                <TranscriptView chatId="cht_a" key="cht_a" />
            </ChatMessageSubscriptionContext>
            <TranscriptView chatId="cht_b" key="cht_b" />
        </>
    );
    return { ...harness, ...view };
}

function entityQueries(harness: { queryClient: QueryClient }, chatId: string) {
    return harness.queryClient
        .getQueryCache()
        .findAll({ predicate: (query) => isChatMessageEntityOf(query, { chatId, serverId }) });
}

test('a reaction on one message re-renders that row and nothing else', async () => {
    const harness = await mountTwoChats();
    // Rows render their entity's prose; the list holds only ids and layout facts.
    expect(harness.container.textContent).toContain('Message 3 in cht_a');
    const reacted = message('cht_a', 3, 'agt_blippy');
    const census = await harness.change(() =>
        harness.setEntity({
            ...reacted,
            reactions: [
                { actors: [{ handle: null, id: viewerUserId, kind: 'human' }], emoji: '👍' },
            ],
        })
    );

    expect(census.count('ChatTranscript')).toBe(0);
    expect(census.count('TranscriptRowSlot')).toBe(0);
    expect(census.count('TranscriptRenderRowView')).toBe(1);
    expect(census.renders().filter((entry) => entry.includes('cht_b'))).toEqual([]);

    await harness.unmount();
});

test('an unchanged entity refetch renders nothing', async () => {
    const harness = await mountTwoChats();
    const census = await harness.change(() => harness.setEntity(message('cht_a', 3, 'agt_blippy')));

    expect(census.count('TranscriptRenderRowView')).toBe(0);
    expect(census.count('TranscriptRenderRowItem')).toBe(0);

    await harness.unmount();
});

test('a hidden kept view observes no entity and an invalidation fetches nothing', async () => {
    const harness = await mountTwoChats({ hidden: true });
    const hidden = entityQueries(harness, 'cht_a');
    const shown = entityQueries(harness, 'cht_b');

    expect(hidden.length).toBe(6);
    expect(hidden.every((query) => query.getObserversCount() === 0)).toBe(true);
    expect(shown.some((query) => query.getObserversCount() > 0)).toBe(true);

    const census = await harness.change(() =>
        harness.queryClient.invalidateQueries({
            predicate: (query) => hidden.includes(query),
            refetchType: 'active',
        })
    );
    expect(hidden.every((query) => query.state.fetchStatus === 'idle')).toBe(true);
    expect(hidden.every((query) => query.state.isInvalidated)).toBe(true);
    expect(census.count('TranscriptRenderRowView')).toBe(0);

    await harness.unmount();
});

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

test('a message in another chat renders nothing in the open chat', async () => {
    const harness = await mountTwoChats();
    // cht_b is the chat on screen; the message lands in kept cht_a.
    const census = await harness.change(() => {
        harness.setMessages('cht_a', [...history('cht_a', 6), message('cht_a', 7, 'agt_tiny')]);
    });

    expect(census.count('TranscriptView', 'cht_b')).toBe(0);
    expect(census.renders().filter((entry) => entry.includes('cht_b'))).toEqual([]);
    expect(census.count('ChatTranscript')).toBe(1);

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

test('a new message in a run of sends renders its own item, not the turn’s others', async () => {
    const harness = await mountTwoChats();
    // One person's consecutive sends share a turn.
    const sends = (count: number) =>
        Array.from({ length: count }, (_, index) => message('cht_a', index + 1));
    await harness.change(() => harness.setMessages('cht_a', sends(4)));
    const census = await harness.change(() => harness.setMessages('cht_a', sends(5)));

    expect(census.count('UserTurn')).toBe(1);
    expect(census.count('UserTurnItem')).toBe(1);
    expect(census.count('UserTurnItemView')).toBe(1);

    await harness.unmount();
});
