import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { testAgent } from '../agent-fixtures.ts';
import { AgentHubCards } from './agent-hub-cards.tsx';

function render(role: ServerDetail['role']) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>
                    <AgentHubCards
                        agent={testAgent({ connectionAdmin: true })}
                        onOpen={() => undefined}
                        revealed={true}
                        server={{ ...server, role }}
                    />
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

const cardTitles = ['Runs on', 'Profile', 'Automations', 'Skills', 'Connections', 'Workspace'];

test('the hub shows its six cards in order for every role, with no Permissions card', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
        const markup = render(role);
        const positions = cardTitles.map((title) => markup.indexOf(title));
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
        expect(markup).not.toContain('Permissions');
        expect(markup).not.toContain('Manage connections');
    }
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
