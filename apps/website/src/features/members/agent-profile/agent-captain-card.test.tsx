import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc, type ServerDetail } from '../../../lib/haus-server.tsx';
import { testAgent } from '../agent-fixtures.ts';
import { AgentCaptainCard } from './agent-captain-card.tsx';

function render(role: ServerDetail['role']) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>
                    <AgentCaptainCard
                        agent={testAgent({ description: 'Keeps the plan tight.' })}
                        onDeleted={() => undefined}
                        onSectionChange={() => undefined}
                        revealed={true}
                        server={{ ...server, role }}
                    />
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

const factLabels = ['Runs on', 'Model', 'Automations', 'Skills', 'Connections', 'Workspace'];

test('the Captain card names the Captain and lists its six setup facts in order for every role', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
        const markup = render(role);
        expect(markup).toContain('Keeps the plan tight.');
        expect(markup).toMatch(/<h1[^>]*>[^<]+<\/h1>/u);
        const positions = factLabels.map((label) => markup.indexOf(`>${label}<`));
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
        expect(markup).toContain('Captain actions');
        expect(markup).not.toContain('Edit Profile');
        expect(markup).not.toContain('Permissions');
    }
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
