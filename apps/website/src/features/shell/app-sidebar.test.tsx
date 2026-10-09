import { expect, test } from 'bun:test';
import type { Agent, Chat } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { testChat } from '../chats/chat-fixtures.ts';
import { testAgent } from '../members/agent-fixtures.ts';
import { ChatNavigation } from './chat-navigation.tsx';
import { CommandMenuProvider } from './command-menu-provider.tsx';
import { ShellSidebar, ShellSidebarPage } from './shell-sidebar.tsx';

test('hides a retired Agent DM from active navigation', () => {
    const markup = renderNavigation({ chats: [retiredDm()] });

    expect(markup).not.toContain('Fen');
    expect(markup).not.toContain('Retired');
});

test('hides the New agent action when no handler is given', () => {
    const markup = renderNavigation({});

    expect(markup).not.toContain('aria-label="New agent"');
});

test('shows the New agent action on Direct messages for a manager', () => {
    const markup = renderNavigation({ onCreateAgent: () => undefined });

    expect(markup).toContain('aria-label="New agent"');
});

test('renders each DM from its own Agent availability', () => {
    const blippy = agent({
        availability: 'working',
        displayName: 'Blippy',
        id: 'agt_blippy000000000',
    });
    const tiny = agent({
        availability: 'idle',
        displayName: 'Tiny',
        id: 'agt_tiny00000000000',
    });
    const markup = renderNavigation({
        agents: [blippy, tiny],
        chats: [dm('chat_blippy', blippy), dm('chat_tiny', tiny)],
        selectedChatId: 'chat_blippy',
    });

    expect(markup).toMatch(
        new RegExp(`data-agent-id="${blippy.id}".*?data-agent-status="working"[^>]*title="Working"`)
    );
    expect(markup).toMatch(
        new RegExp(`data-agent-id="${tiny.id}".*?data-agent-status="idle"[^>]*title="Online"`)
    );
});

test('renders an active Agent as an implicit DM without a Chat row', () => {
    const blippy = agent({
        availability: 'idle',
        displayName: 'Blippy',
        id: 'agt_blippy000000000',
    });
    const markup = renderNavigation({ agents: [blippy], selectedAgentDmId: blippy.id });

    expect(markup).toContain('Blippy');
    expect(markup).toContain(`/s/haus/dm/${blippy.id}`);
    expect(markup.match(/Blippy/g)?.length).toBeGreaterThan(0);
});

test('keeps a draggable channel row out of native window dragging without a handle', () => {
    const markup = renderNavigation({ chats: [channel()] });

    expect(markup).toContain('no-drag sortable-channel-row');
    expect(markup).not.toContain('Reorder');
    expect(markup).toContain('--channel-color-light:#7c3aed');
    expect(markup).toContain('--channel-color-dark:#a78bfa');
});

test('keeps context-menu chat rows on the stock Sidebar icon gap', () => {
    const blippy = agent({
        availability: 'idle',
        displayName: 'Blippy',
        id: 'agt_blippy000000000',
    });
    const markup = renderNavigation({
        agents: [blippy],
        chats: [channel(), dm('chat_blippy', blippy)],
    });
    const rowTriggers = markup.match(
        /context-menu__trigger flex min-w-0 flex-1 items-center gap-3/g
    );

    expect(rowTriggers).toHaveLength(2);
    expect(markup).not.toContain('context-menu__trigger flex min-w-0 flex-1 items-center gap-2');
});

test('keeps unread count chips circular until the number needs a pill', () => {
    const markup = renderNavigation({
        chats: [
            channel({ id: 'chat_one', unreadCount: 1 }),
            channel({ id: 'chat_ten', unreadCount: 10 }),
        ],
    });

    expect(markup).toContain('aria-label="1 unread"');
    expect(markup).toContain('aria-label="10 unread"');
    expect(markup).toContain('min-w-5 justify-center tabular-nums');
});

function agent(overrides: Pick<Agent, 'availability' | 'displayName' | 'id'>): Agent {
    return testAgent({ ...overrides, handle: overrides.displayName.toLowerCase() });
}

function dm(id: string, peer: Agent): Chat {
    return testChat({
        id,
        kind: 'dm',
        name: null,
        participantAgentIds: [peer.id],
        participantUserIds: ['user_one'],
        peerAgentDisplayName: peer.displayName,
        peerAgentId: peer.id,
    });
}

function retiredDm(): Chat {
    return testChat({
        id: 'chat_fen',
        kind: 'dm',
        lastMessageSequence: 4,
        name: null,
        participantUserIds: ['user_one'],
        peerAgentDisplayName: 'Fen',
        peerAgentId: 'agt_fen0000000000000',
        peerAgentRetired: true,
    });
}

function channel(overrides: Partial<Pick<Chat, 'id' | 'unreadCount'>> = {}): Chat {
    return testChat({
        color: 'violet',
        icon: 'RocketIcon',
        id: 'chat_planning',
        participantUserIds: ['user_one'],
        ...overrides,
    });
}

const serverId = 'server_one';

/** The sidebar over a cache seeded with the Server's chat and Agent lists. */
function renderNavigation({
    agents = [],
    chats = [],
    ...props
}: {
    agents?: Agent[];
    chats?: Chat[];
} & Partial<React.ComponentProps<typeof ChatNavigation>>) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({ links: [] });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.agent.list.setData({ serverId }, agents);
    utils.chat.list.setData({ serverId }, chats);
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>
                    <CommandMenuProvider>
                        <Sidebar.Provider>
                            <ShellSidebar activePage="server" slug="dev">
                                <ShellSidebarPage ariaLabel="Server" value="server">
                                    <ChatNavigation
                                        onCreateChannel={() => undefined}
                                        onPreloadSection={() => undefined}
                                        selectedChatId={undefined}
                                        serverId={serverId}
                                        slug="haus"
                                        {...props}
                                    />
                                </ShellSidebarPage>
                            </ShellSidebar>
                        </Sidebar.Provider>
                    </CommandMenuProvider>
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
