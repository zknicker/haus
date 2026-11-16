import { expect, test } from 'bun:test';
import type { OpenThread } from '@haus/api';
import { Sidebar } from '@heroui-pro/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SidebarNavigateProvider } from '../../hooks/shell/sidebar-navigate.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { OpenThreadsSection } from './open-threads-section.tsx';

const serverId = 'server_one';

test('renders nothing, not even its header, while no Thread is open', () => {
    expect(render([])).not.toContain('data-slot="sidebar-group"');
});

test('renders nothing until the read settles', () => {
    expect(render(undefined)).not.toContain('data-slot="sidebar-group"');
});

test('names the section Threads and offers All threads as its hover action', () => {
    const markup = render([thread('t1')]);

    expect(markup).toContain('data-slot="sidebar-group"');
    expect(markup).toContain('>Threads<');
    expect(markup).toContain('aria-label="Threads"');
    expect(markup).toContain('aria-label="All threads"');
    expect(markup).not.toContain('Open threads');
    expect(markup).not.toContain('more<');
});

test('closes a folded list with one quiet row to the Threads page', () => {
    const markup = render(Array.from({ length: 15 }, (_, index) => thread(`t${index}`)));

    expect(markup).toContain('>3 more<');
    expect(markup).toContain('href="/s/haus/threads"');
});

function thread(id: string): OpenThread {
    return {
        actorName: null,
        anchorMessageId: `msg_${id}`,
        at: null,
        expiresAt: null,
        group: 'recent',
        jobCount: 0,
        lastActivityAt: null,
        liveJobCount: 0,
        mentionsViewer: false,
        parentChatId: 'chat_all',
        state: 'active',
        threadChatId: id,
        title: `Thread ${id}`,
        unreadCount: 0,
        updatedAt: null,
        viewerTookPart: true,
    };
}

function render(threads: OpenThread[] | undefined) {
    const queryClient = new QueryClient();
    if (threads) {
        queryClient.setQueryData(getQueryKey(hausTrpc.thread.listOpen, { serverId }, 'query'), {
            closedThreadChatIds: [],
            threads,
        });
    }
    const client = hausTrpc.createClient({ links: [] });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>
                    <SidebarNavigateProvider>
                        <Sidebar.Provider>
                            <OpenThreadsSection currentPath="/" serverId={serverId} slug="haus" />
                        </Sidebar.Provider>
                    </SidebarNavigateProvider>
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
