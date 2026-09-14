import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { hausTrpc, type ServerDetail } from '../../lib/haus-server.tsx';
import { SettingsHumanRoute } from '../../routes/app/settings-route.tsx';
import { ComputerPage } from '../computers/computer-page.tsx';
import { ProfileSettings } from '../settings/profile/page.tsx';
import { AgentUsageTile } from '../usage/agent-usage-tile.tsx';
import { testAgent } from './agent-fixtures.ts';
import { AgentPeekHeader } from './agent-peek/agent-peek-header.tsx';

test('an unresolved human profile keeps identity labels and its independent Agent section', () => {
    const markup = render(
        <Routes>
            <Route element={<Outlet context={{ server }} />}>
                <Route element={<SettingsHumanRoute />} path="/:userId" />
            </Route>
        </Routes>
    );
    for (const label of ['Profile', 'Role', 'Email', 'Joined', 'Created Agents']) {
        expect(markup).toContain(label);
    }
    expect(markup).not.toContain('No Agents created');
});

test('Profile settings renders disabled identity fields before its directory resolves', () => {
    const markup = render(<ProfileSettings serverId={server.id} />);
    for (const label of ['Identity', 'Photo', 'Display Name', 'Handle']) {
        expect(markup).toContain(label);
    }
    expect(markup.match(/<input[^>]*disabled/gu)).toHaveLength(2);
    expect(markup).toContain('aria-busy="true"');
});

test('Computer profile reserves all its sections before its roster resolves', () => {
    const markup = render(<ComputerPage serverId={server.id} serverSlug={server.slug} />);
    for (const label of [
        'Runtimes',
        'Browser',
        'Cloud Agents',
        'Agents on This Computer',
        'System Log',
        'Computer Management',
    ]) {
        expect(markup).toContain(label);
    }
    expect(markup).not.toContain('Attach a Computer');
    expect(markup).not.toContain('No Agents assigned');
});

test('Agent peek keeps its navigation controls without an Agent snapshot', () => {
    const markup = render(
        <AgentPeekHeader
            agent={undefined}
            onClose={() => undefined}
            onOpenProfile={() => undefined}
            server={server}
        />
    );
    expect(markup).toContain('Profile');
    expect(markup).toContain('Open profile');
    expect(markup).toContain('aria-label="Close"');
});

test('Agent usage reserves the tile and link without inventing a token total', () => {
    const markup = render(<AgentUsageTile agent={testAgent()} server={server} />);
    expect(markup).toContain('Processed tokens');
    expect(markup).toContain('See in Usage');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('No model turns');
});

function render(children: ReactNode) {
    const queryClient = new QueryClient();
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter initialEntries={['/user_one']}>{children}</MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}

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
