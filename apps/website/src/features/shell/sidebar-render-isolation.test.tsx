import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Sidebar } from '@heroui-pro/react';
import { useChatMessages } from '../../hooks/servers/use-chat-messages.ts';
import { installKeptChatViewTestDom } from '../../test-support/kept-chat-views-harness.tsx';
import {
    agents,
    chat,
    createTranscriptHarness,
    history,
    installTranscriptBrowserStubs,
    serverId,
    viewerUserId,
} from '../../test-support/transcript-render-harness.tsx';
import { ChatTranscript } from '../servers/chat/chat-transcript.tsx';
import { ChatNavigation } from './chat-navigation.tsx';
import { CommandMenuProvider } from './command-menu-provider.tsx';

// A message anywhere updates the chat list, and an Agent turn flips the Agent
// list. Both used to re-render the whole sidebar and every live avatar's
// frame; each test applies the cache change a realtime event causes and
// asserts what rendered for it.

installKeptChatViewTestDom();
let restoreStubs: () => void;
const scope = globalThis as Record<string, unknown>;
const observers = ['MutationObserver', 'ResizeObserver'] as const;
const savedObservers = observers.map((name) => scope[name]);
beforeAll(() => {
    restoreStubs = installTranscriptBrowserStubs();
    // The sidebar's scroll shadow observes its subtree; nothing here lays out.
    for (const name of observers) {
        scope[name] = class {
            disconnect() {}
            observe() {}
            unobserve() {}
        };
    }
});
afterAll(() => {
    restoreStubs();
    observers.forEach((name, index) => {
        scope[name] = savedObservers[index];
    });
});

const blippyDm = chat('cht_dm_blippy', {
    kind: 'dm',
    name: null,
    peerAgentDisplayName: 'Blippy',
    peerAgentId: 'agt_blippy',
});
const listed = [chat('cht_a'), chat('cht_b'), blippyDm];

function TranscriptView({ chatId }: { chatId: string }) {
    const messages = useChatMessages(serverId, chatId);
    return (
        <ChatTranscript
            chatId={chatId}
            messages={messages.data?.messages}
            onOpenArtifact={() => undefined}
            serverId={serverId}
            threads={messages.data?.threads}
            viewerUserId={viewerUserId}
        />
    );
}

async function mountSidebarAndTranscripts() {
    const harness = createTranscriptHarness();
    harness.setChats(listed);
    for (const chatId of ['cht_a', 'cht_b']) {
        harness.setMessages(chatId, history(chatId, 6));
        harness.setCloudAgentWork(chatId);
    }
    const view = await harness.mount(
        <>
            <CommandMenuProvider>
                <Sidebar.Provider>
                    <ChatNavigation
                        onCreateChannel={() => undefined}
                        onPreloadSection={() => undefined}
                        selectedChatId="cht_a"
                        serverId={serverId}
                        slug="render"
                    />
                </Sidebar.Provider>
            </CommandMenuProvider>
            <TranscriptView chatId="cht_a" />
            <TranscriptView chatId="cht_b" />
        </>
    );
    return { ...harness, ...view };
}

test('an unread count in one chat renders that chat’s row and nothing else', async () => {
    const harness = await mountSidebarAndTranscripts();
    // A refetch delivers every chat as a fresh object; only cht_b changed.
    const census = await harness.change(() => {
        harness.setChats([
            chat('cht_a'),
            chat('cht_b', { lastActivityAt: '2026-10-09T12:00:00.000Z', unreadCount: 1 }),
            { ...blippyDm },
        ]);
    });

    expect(census.count('SortableChannelRow')).toBe(1);
    expect(census.count('SortableChannelRow', 'cht_b')).toBe(1);
    expect(census.count('ChatNavigation')).toBe(0);
    expect(census.count('SortableChannelList')).toBe(0);
    expect(census.count('AgentDmNavigationRow')).toBe(0);
    expect(census.count('ChatTranscript')).toBe(0);

    await harness.unmount();
});

test('a message in the open chat renders no sidebar row', async () => {
    const harness = await mountSidebarAndTranscripts();
    // Read as it lands: only the chat's activity fields move.
    const census = await harness.change(() => {
        harness.setChats([
            chat('cht_a', { lastActivityAt: '2026-10-09T12:00:00.000Z', lastMessageSequence: 7 }),
            chat('cht_b'),
            { ...blippyDm },
        ]);
    });

    expect(census.count('SortableChannelRow')).toBe(0);
    expect(census.count('ChatNavigationRow')).toBe(0);
    expect(census.count('AgentDmNavigationRow')).toBe(0);

    await harness.unmount();
});

test('an unread count in an Agent DM renders only that DM row', async () => {
    const harness = await mountSidebarAndTranscripts();
    const census = await harness.change(() => {
        harness.setChats([chat('cht_a'), chat('cht_b'), { ...blippyDm, unreadCount: 2 }]);
    });

    expect(census.count('AgentDmNavigationRow')).toBe(1);
    expect(census.count('AgentDmNavigationRow', 'agt_blippy')).toBe(1);
    expect(census.count('SortableChannelRow')).toBe(0);
    expect(census.count('ChatNavigation')).toBe(0);

    await harness.unmount();
});

test('an Agent availability flip renders only that Agent’s presence dots', async () => {
    const harness = await mountSidebarAndTranscripts();
    const census = await harness.change(() => {
        harness.utils.agent.list.setData(
            { serverId },
            agents.map((agent) =>
                agent.id === 'agt_blippy' ? { ...agent, availability: 'working' } : { ...agent }
            )
        );
    });

    // Blippy's sidebar DM and its three turns in each transcript; not Tiny's DM row.
    expect(census.count('LivePresenceBadge')).toBe(7);
    expect(census.count('AgentAvatarFrame')).toBe(0);
    expect(census.count('AgentDmNavigationRow')).toBe(0);
    expect(census.count('ChatNavigation')).toBe(0);
    expect(census.count('TranscriptRowSlot')).toBe(0);

    await harness.unmount();
});
