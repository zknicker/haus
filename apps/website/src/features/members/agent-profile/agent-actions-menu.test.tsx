import { expect, test } from 'bun:test';
import { Dropdown } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { testAgent } from '../agent-fixtures.ts';
import { AgentActions, AgentActionsSections } from './agent-actions-menu.tsx';
import type { AgentSection } from './agent-sections.ts';

/** The menu's items, rendered open: the same sections every host's menu holds. */
function renderMenu(role: ServerDetail['role'], onOpenSection?: (section: AgentSection) => void) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <AgentActions
                    agent={testAgent()}
                    onDeleted={() => undefined}
                    onOpenSection={onOpenSection}
                    server={{ ...server, role }}
                >
                    <Dropdown.Menu aria-label="Agent actions">
                        <AgentActionsSections />
                    </Dropdown.Menu>
                </AgentActions>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

test('an Owner or Admin opens Permissions from the hub menu, ahead of the lifecycle verbs', () => {
    for (const role of ['owner', 'admin'] as const) {
        const markup = renderMenu(role, () => undefined);
        expect(markup).toContain('Permissions');
        expect(markup.indexOf('Permissions')).toBeLessThan(markup.indexOf('Stop'));
        expect(markup.indexOf('Stop')).toBeLessThan(markup.indexOf('Delete Agent'));
    }
});

test('a Member gets no Permissions item', () => {
    const markup = renderMenu('member', () => undefined);
    expect(markup).toContain('Stop');
    expect(markup).not.toContain('Permissions');
});

test('a host without section navigation shows only the lifecycle verbs', () => {
    const markup = renderMenu('owner');
    expect(markup).toContain('Stop');
    expect(markup).not.toContain('Permissions');
});

const server: ServerDetail = {
    avatarGenerationAvailable: false,
    channels: [],
    displayName: 'Haus HQ',
    id: 'server_one',
    onboarding: {
        agentId: null,
        applicationId: null,
        channelId: 'channel_one',
        computerId: null,
        failure: null,
        modelId: null,
        phase: 'complete',
        runtimeId: null,
    },
    role: 'owner',
    slug: 'haus-hq',
    viewerUserId: 'user_one',
};
