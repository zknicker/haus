import { expect, test } from 'bun:test';
import type { RepoList } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { ReposSettings } from './page.tsx';

const serverId = 'srv_repos';

test('each repo shows its Devices and App access, with a way to fix access and recheck', () => {
    const html = render({
        canInstallGithubApp: true,
        githubConnectionId: 'mcp_github',
        repos: [
            {
                folders: [
                    {
                        computerId: 'cmp_1',
                        computerName: 'MacBook Pro',
                        path: '/a',
                        state: 'present',
                    },
                    { computerId: 'cmp_2', computerName: 'Mac mini', path: '/b', state: null },
                ],
                githubAccess: {
                    installation: {
                        account: { id: 77, login: 'acme', type: 'Organization' },
                        githubInstallationId: 5201,
                    },
                    status: 'app-needs-access',
                },
                repository: 'acme/widgets',
            },
            {
                folders: [
                    {
                        computerId: 'cmp_1',
                        computerName: 'MacBook Pro',
                        path: '/c',
                        state: 'present',
                    },
                ],
                githubAccess: { status: 'ready' },
                repository: 'acme/site',
            },
        ],
    });

    expect(html).toContain('acme/widgets');
    expect(html).toContain('MacBook Pro, Mac mini');
    expect(html).toContain('App access needed');
    expect(html).toContain('Grant on GitHub');
    expect(html).toContain('Recheck');
    expect(html).toContain('acme/site');
    expect(html).toContain('Ready');
    expect(html.match(/Grant on GitHub/gu)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*>Add repository<\/button>/u);
    expect(html).toContain('Manage the GitHub installation');
    expect(html).toContain('href="/s/haus/settings/connections/mcp_github"');
});

test('no repos yet is an empty state with Add repository; without GitHub it says so', () => {
    const empty = render({ canInstallGithubApp: false, githubConnectionId: null, repos: [] });
    expect(empty).toContain('No repositories yet');
    expect(empty).toContain('href="/s/haus/settings/connections"');

    const unconnected = render({
        canInstallGithubApp: false,
        githubConnectionId: null,
        repos: [
            { folders: [], githubAccess: { status: 'github-not-connected' }, repository: 'a/b' },
        ],
    });
    expect(unconnected).toContain('GitHub not connected');
    expect(unconnected).toContain('Connect GitHub');
    expect(unconnected).toContain('No folders yet');
    expect(unconnected).not.toContain('Recheck');
});

test('nothing but the header shows while the list loads', () => {
    const html = render(null);

    expect(html).toContain('Repositories');
    expect(html).not.toContain('No repositories yet');
    expect(html).not.toContain('Manage the GitHub installation');
});

function render(list: RepoList | null) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    if (list) {
        createTRPCQueryUtils({ client, queryClient }).repo.list.setData({ serverId }, list);
    }
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter>
                    <ReposSettings serverId={serverId} serverSlug="haus" />
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
