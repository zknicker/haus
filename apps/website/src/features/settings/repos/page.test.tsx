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

test('a repo that needs App access says so beside one Fix control; a ready repo stays quiet', () => {
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
    expect(html).toContain('App access needed · MacBook Pro, Mac mini');
    expect(html).toContain('aria-label="Fix access to acme/widgets"');
    expect(html).not.toContain('Recheck');
    expect(html).toContain('acme/site');
    expect(html).not.toContain('Ready');
    expect(html.match(/<span[^>]*class="[^"]*chip/gu)).toBeNull();
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
    expect(unconnected).toContain('GitHub not connected · No folders yet');
    expect(unconnected).toContain('Connect GitHub');
    expect(unconnected).not.toContain('Recheck');
});

test('when GitHub does not answer, the row offers Recheck alone', () => {
    const html = render({
        canInstallGithubApp: false,
        githubConnectionId: 'mcp_github',
        repos: [{ folders: [], githubAccess: { status: 'github-unavailable' }, repository: 'a/b' }],
    });
    expect(html).toContain('GitHub unavailable · No folders yet');
    expect(html.match(/>Recheck</gu)).toHaveLength(1);
    expect(html).not.toContain('Grant on GitHub');
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
