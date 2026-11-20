import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { Task } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import { installKeptChatViewTestDom } from '../../test-support/kept-chat-views-harness.tsx';
import {
    agents,
    chat,
    createTranscriptHarness,
    installTranscriptBrowserStubs,
    serverId,
} from '../../test-support/transcript-render-harness.tsx';
import { CommandMenuProvider } from '../shell/command-menu-provider.tsx';
import { CapySidebar } from './capy-sidebar.tsx';

installKeptChatViewTestDom();
let restoreStubs: () => void;
const scope = globalThis as Record<string, unknown>;
const observers = ['MutationObserver', 'ResizeObserver'] as const;
const savedObservers = observers.map((name) => scope[name]);
beforeAll(() => {
    restoreStubs = installTranscriptBrowserStubs();
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
const projectA = () => chat('cht_a', { participantAgentIds: ['agt_blippy'] });
const projectB = () => chat('cht_b', { participantAgentIds: ['agt_tiny'] });
const openTask = {
    assignee: { agentId: 'agt_tiny', kind: 'agent' },
    chatId: 'cht_task',
    createdAt: '2026-11-18T10:00:00.000Z',
    id: 'tsk_1',
    key: 'ENG-1',
    state: 'open',
    title: 'Composer fonts',
} as Task;

async function mountCapySidebar() {
    const harness = createTranscriptHarness();
    harness.setChats([projectA(), projectB(), blippyDm]);
    harness.utils.task.listOpen.setData({ serverId }, [openTask]);
    harness.utils.chat.unreadPreviews.setData({ serverId }, { previews: [] });
    const view = await harness.mount(
        <CommandMenuProvider>
            <Sidebar.Provider>
                <SidebarNavigateProvider>
                    <CapySidebar canManage lead="strip" serverId={serverId} slug="render" />
                </SidebarNavigateProvider>
            </Sidebar.Provider>
        </CommandMenuProvider>
    );
    return { ...harness, ...view };
}

test('an unread count in one Project renders that Project’s row and nothing else', async () => {
    const harness = await mountCapySidebar();
    const census = await harness.change(() => {
        harness.setChats([
            projectA(),
            chat('cht_b', {
                lastActivityAt: '2026-11-19T12:00:00.000Z',
                participantAgentIds: ['agt_tiny'],
                unreadCount: 1,
            }),
            { ...blippyDm },
        ]);
    });

    expect(census.count('SortableChannelRow')).toBe(1);
    expect(census.count('SortableChannelRow', 'cht_b')).toBe(1);
    expect(census.count('CapySidebar')).toBe(0);
    expect(census.count('CaptainTileLink')).toBe(0);
    expect(census.count('OpenTaskNavigationRow')).toBe(0);

    await harness.unmount();
});

test('a message that moves only activity renders no Capy sidebar row', async () => {
    const harness = await mountCapySidebar();
    const census = await harness.change(() => {
        harness.setChats([
            chat('cht_a', {
                lastActivityAt: '2026-11-19T12:00:00.000Z',
                lastMessageSequence: 7,
                participantAgentIds: ['agt_blippy'],
            }),
            projectB(),
            { ...blippyDm },
        ]);
    });

    expect(census.count('SortableChannelRow')).toBe(0);
    expect(census.count('CaptainTileLink')).toBe(0);
    expect(census.count('CapySidebar')).toBe(0);

    await harness.unmount();
});

test('an unread count in a Captain DM renders only that Captain’s tile', async () => {
    const harness = await mountCapySidebar();
    const census = await harness.change(() => {
        harness.setChats([projectA(), projectB(), { ...blippyDm, unreadCount: 2 }]);
    });

    expect(census.count('CaptainTileLink')).toBe(1);
    expect(census.count('CaptainTileLink', 'agt_blippy')).toBe(1);
    expect(census.count('SortableChannelRow')).toBe(0);
    expect(census.count('CapySidebar')).toBe(0);

    await harness.unmount();
});

test('a Captain starting work renders only that Captain’s tile', async () => {
    const harness = await mountCapySidebar();
    const census = await harness.change(() => {
        harness.utils.agent.list.setData(
            { serverId },
            agents.map((agent) =>
                agent.id === 'agt_blippy' ? { ...agent, availability: 'working' } : { ...agent }
            )
        );
    });

    expect(census.count('CaptainTileLink')).toBe(1);
    expect(census.count('CaptainTileLink', 'agt_blippy')).toBe(1);
    expect(census.count('SortableChannelRow')).toBe(0);
    expect(census.count('OpenTaskNavigationRow')).toBe(0);
    expect(census.count('CapySidebar')).toBe(0);

    await harness.unmount();
});

test('an @mention of you in a Task renders that Task’s row and moves it first', async () => {
    const harness = await mountCapySidebar();
    const census = await harness.change(() => {
        harness.utils.chat.unreadPreviews.setData({ serverId }, {
            previews: [
                {
                    chatId: 'cht_task',
                    earlierUnreadCount: 0,
                    messages: [{ content: '[@Viewer](user://usr_viewer) ok?' }],
                    task: null,
                },
            ],
        } as never);
    });

    expect(census.count('OpenTaskNavigationRow', 'tsk_1')).toBe(1);
    expect(census.count('SortableChannelRow')).toBe(0);
    expect(census.count('CaptainTileLink')).toBe(0);
    expect(harness.container.textContent).toContain('Waiting on you');

    await harness.unmount();
});
