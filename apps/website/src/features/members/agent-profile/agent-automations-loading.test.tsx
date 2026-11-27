import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { testAgent } from '../agent-fixtures.ts';
import { AgentAutomations } from './agent-content.tsx';
import { AgentRecent } from './agent-recent.tsx';

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
                    <AgentRecent agent={testAgent()} onSeeAll={() => undefined} server={server} />
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
    expect(markup).toContain('Reminders</h');
    expect(markup).toContain('Triggers</h');
    expect(markup).not.toContain('Workers</h');
    expect(markup).toContain('aria-label="New Trigger"');
    expect(markup).toContain('aria-label="View reminder history"');
    expect(markup).not.toContain('Nothing scheduled');
    expect(markup).not.toContain('No triggers yet');
    expect(markup).not.toContain('Recent</h');
    expect(markup).not.toContain('No activity yet');
    expect(markup.match(/aria-busy="true"/gu)).toHaveLength(3);
});

const server: ServerDetail = {
    avatarGenerationAvailable: false,
    channels: [],
    displayName: 'Haus HQ',
    id: 'server_one',
    role: 'owner',
    slug: 'haus-hq',
    viewerUserId: 'user_one',
};
