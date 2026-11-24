import { expect, test } from 'bun:test';
import type { ComputerRepoFolders, RepoFolderState, RepoList } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { RepoFolderDisclosure } from '../settings/repos/repo-folder-disclosure.tsx';
import { ComputerRepoFoldersCard } from './computer-repo-folders-card.tsx';

const serverId = 'srv_devices';
const computerId = 'cmp_devicestudio0000';
const target = { computerId, serverId };
const checkout = '/Users/ada/code/haus';
const clone = '/Users/ada/.haus/computer/servers/srv_devices/repos/haus/tools';

const folders = [
    {
        addedAt: '2026-11-20T12:00:00.000Z',
        addedBy: { name: 'Ada', userId: 'usr_ada' },
        computerId,
        path: checkout,
        repository: 'haus/haus',
    },
    {
        addedAt: '2026-11-21T12:00:00.000Z',
        addedBy: null,
        computerId,
        path: clone,
        repository: 'haus/tools',
    },
];

const repos: RepoList = {
    canInstallGithubApp: true,
    githubConnectionId: 'mcp_github',
    repos: [
        { folders: [], githubAccess: { status: 'ready' }, repository: 'haus/haus' },
        {
            folders: [],
            githubAccess: { installation: null, status: 'app-needs-access' },
            repository: 'haus/tools',
        },
    ],
};

test('a healthy folder is quiet and a folder with a GitHub gap shows that one issue', () => {
    const html = render({
        folders: { canAdd: true, canRemove: true, folders },
        repos,
        states: [
            { path: checkout, state: 'present' },
            { path: clone, state: 'present' },
        ],
    });
    expect(html).not.toContain('Ready');
    expect(html.match(/App access needed/gu)).toHaveLength(1);
});

test('Folders lists each path with its repo, its top issue, a row menu, and Add folder', () => {
    const html = render({
        folders: { canAdd: true, canRemove: true, folders },
        repos,
        states: [
            { path: checkout, state: 'present' },
            { path: clone, state: 'missing' },
        ],
    });

    expect(html).toContain('Folders');
    expect(html).toContain(checkout);
    expect(html).toContain('haus/haus');
    expect(html).toContain(clone);
    expect(html).toContain('haus/tools, Haus’s own clone');
    expect(html).not.toContain('Ready');
    expect(html).not.toContain('App access needed');
    expect(html.match(/Missing/gu)).toHaveLength(1);
    expect(html.match(/<hr/gu)).toHaveLength(1);
    expect(html).toContain('aria-label="haus/haus actions"');
    expect(html).toContain('aria-label="haus/tools actions"');
    expect(html).toMatch(/<button[^>]*>Add folder<\/button>/u);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Add folder/u);
});

test('someone who cannot add still sees every folder with its menu, and no Add folder', () => {
    const html = render({ folders: { canAdd: false, canRemove: false, folders } });

    expect(html).toContain('haus/haus');
    expect(html).toContain('haus/haus actions');
    expect(html).not.toContain('Add folder');
});

test('the empty row shows only once the folders loaded with none', () => {
    expect(render({ folders: { canAdd: true, canRemove: true, folders: [] } })).toContain(
        'No folders yet'
    );
    const loading = render({});
    expect(loading).toContain('Folders');
    expect(loading).not.toContain('No folders yet');
});

test('an offline Device keeps its folders listed and holds Add folder', () => {
    const html = render({
        folders: { canAdd: true, canRemove: true, folders },
        health: 'offline',
        states: [{ path: clone, state: 'missing' }],
    });

    expect(html).toContain('haus/haus');
    expect(html).not.toContain('Missing');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add folder/u);
});

test('the add flow says what the folder grants', () => {
    const html = renderToStaticMarkup(<RepoFolderDisclosure />);

    expect(html).toContain(
        'Workers and Captains work in git worktrees of this folder and share its <code>.git</code>. A Worker can change its branches, including <code>main</code>, and its hooks and config.'
    );
});

function render(input: {
    folders?: ComputerRepoFolders;
    health?: string;
    repos?: RepoList;
    states?: { path: string; state: RepoFolderState }[];
}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.server.list.setData(undefined, [{ id: serverId, slug: 'devices' }] as never);
    utils.computer.list.setData({ serverId }, [
        {
            health: input.health ?? 'healthy',
            id: computerId,
            name: 'Studio Mac',
            operatingSystem: 'darwin',
            reportedInventory: { name: 'Studio Mac', runtimes: [] },
        },
    ] as never);
    if (input.folders) {
        utils.computer.repoFolders.setData(target, input.folders);
    }
    if (input.states) {
        utils.computer.repoFolderStates.setData(target, { states: input.states });
    }
    if (input.repos) {
        utils.repo.list.setData({ serverId }, input.repos);
    }
    return renderToStaticMarkup(
        <Providers client={client} queryClient={queryClient}>
            <ComputerRepoFoldersCard computerId={computerId} serverId={serverId} />
        </Providers>
    );
}

function Providers({
    children,
    client,
    queryClient,
}: {
    children: React.ReactNode;
    client: ReturnType<typeof hausTrpc.createClient>;
    queryClient: QueryClient;
}) {
    return (
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                {children}
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
