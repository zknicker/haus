import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { testAgent } from '../agent-fixtures.ts';
import { AgentChats } from './agent-chats.tsx';
import { AgentAutomations } from './agent-content.tsx';
import { AgentRecentActivity } from './agent-recent-activity.tsx';

test('pending profile lists keep headings and actions without premature empty states', () => {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    const markup = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>
                    <AgentAutomations agent={testAgent()} server={server} />
                    <AgentChats agent={testAgent()} server={server} />
                    <AgentRecentActivity agent={testAgent()} server={server} />
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
    expect(markup).toContain('Reminders</h');
    expect(markup).toContain('Triggers</h');
    expect(markup).toContain('aria-label="New Trigger"');
    expect(markup).toContain('aria-label="View reminder history"');
    expect(markup).not.toContain('Nothing scheduled');
    expect(markup).not.toContain('No triggers yet');
    expect(markup).toContain('Chats</h');
    expect(markup).toContain('Recent activity</h');
    expect(markup).not.toContain('No chats yet');
    expect(markup).not.toContain('No activity yet');
    expect(markup.match(/aria-busy="true"/gu)).toHaveLength(4);
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
