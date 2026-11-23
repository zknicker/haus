import { expect, test } from 'bun:test';
import type { ComputerRepoFolders, RepoFolderState } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { RepoFolderDisclosure } from './computer-repo-folder-add-dialog.tsx';
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

test('the attacher sees each folder with its repo, path and adder, a row menu, and Add folder', () => {
    const html = render({
        folders: { canAdd: true, canRemove: true, folders },
        states: [
            { path: checkout, state: 'present' },
            { path: clone, state: 'missing' },
        ],
    });

    expect(html).toContain('Repositories');
    expect(html).toContain('haus/haus');
    expect(html).toContain(checkout);
    expect(html).toContain('Added by Ada');
    expect(html).toContain('haus/tools');
    expect(html).toContain(clone);
    expect(html).toContain('Haus clone');
    expect(html.match(/Missing/gu)).toHaveLength(1);
    expect(html).toContain('aria-label="haus/haus actions"');
    expect(html).toContain('aria-label="haus/tools actions"');
    expect(html).toMatch(/<button[^>]*>Add folder<\/button>/u);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Add folder/u);
});

test('an Admin who is not the attacher can remove a folder but not add one', () => {
    const html = render({ folders: { canAdd: false, canRemove: true, folders } });

    expect(html).toContain('haus/haus actions');
    expect(html).not.toContain('Add folder');
});

test('a member who can neither add nor remove sees the folders without any menu', () => {
    const html = render({ folders: { canAdd: false, canRemove: false, folders } });

    expect(html).toContain('haus/haus');
    expect(html).not.toContain('actions"');
    expect(html).not.toContain('Add folder');
});

test('the empty state shows only once the folders loaded with none', () => {
    expect(render({ folders: { canAdd: true, canRemove: true, folders: [] } })).toContain(
        'No repo folders'
    );
    const loading = render({});
    expect(loading).toContain('Repositories');
    expect(loading).not.toContain('No repo folders');
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

test('Add folder says what the folder grants', () => {
    const html = renderToStaticMarkup(<RepoFolderDisclosure />);

    expect(html).toContain(
        'Workers and Captains work in git worktrees of this folder and share its <code>.git</code>. A Worker can change its branches, including <code>main</code>, and its hooks and config.'
    );
});

function render(input: {
    folders?: ComputerRepoFolders;
    health?: string;
    states?: { path: string; state: RepoFolderState }[];
}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
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
