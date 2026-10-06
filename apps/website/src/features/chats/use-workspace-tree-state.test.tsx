import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { WorkspaceFileEntry } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import type { WorkspaceTreeNode } from './chat-artifact-workspace-model.ts';
import { useWorkspaceTreeState, type WorkspaceTreeState } from './use-workspace-tree-state.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const scope = { agentId: 'agent-1', includeHidden: false, serverId: 'server-1' };
const key = (path: string, agentId = scope.agentId) =>
    getQueryKey(hausTrpc.agent.workspaceFiles, { ...scope, agentId, path }, 'query');

test('open folders and their listings survive a root refetch of the same workspace', async () => {
    const harness = await mount();
    harness.seed('', [directory('out'), file('NOTES.md')]);
    harness.seed('out', [file('out/preview.html')]);
    await harness.render();

    await harness.act(() => harness.state().onToggleDirectory('out'));
    expect([...harness.state().expandedKeys]).toEqual(['out']);
    expect(ids(harness.state().nodes)).toContain('out/preview.html');

    // A `computer` server event invalidates the root listing many times a minute.
    await harness.act(() => harness.seed('', [directory('out'), file('NOTES.md'), file('new.md')]));
    expect([...harness.state().expandedKeys]).toEqual(['out']);
    expect(ids(harness.state().nodes)).toEqual(['out', 'out/preview.html', 'new.md', 'NOTES.md']);

    // A folder the fresh root listing lacks closes instead of lingering.
    await harness.act(() => harness.seed('', [file('NOTES.md')]));
    expect([...harness.state().expandedKeys]).toEqual([]);

    await harness.unmount();
});

test('a search opens every match without touching the reader’s expansion', async () => {
    const harness = await mount();
    harness.seed('', [directory('docs'), directory('out')]);
    harness.seed('docs', [file('docs/plan.md')]);
    harness.seed('out', [file('out/preview.html')]);
    await harness.render();
    await harness.act(() => harness.state().onToggleDirectory('docs'));
    await harness.act(() => harness.state().onToggleDirectory('docs'));
    await harness.act(() => harness.state().onToggleDirectory('out'));

    await harness.act(() => harness.state().onQueryChange('plan'));
    expect([...harness.state().expandedKeys]).toEqual(['docs']);
    await harness.act(() => harness.state().onExpandedChange(new Set()));
    expect([...harness.state().expandedKeys]).toEqual([]);

    await harness.act(() => harness.state().onQueryChange(''));
    expect([...harness.state().expandedKeys]).toEqual(['out']);

    await harness.unmount();
});

test('another Agent starts from a closed tree', async () => {
    const harness = await mount();
    harness.seed('', [directory('out')]);
    harness.seed('out', []);
    await harness.render();
    await harness.act(() => harness.state().onToggleDirectory('out'));

    await harness.render({ agentId: 'agent-2' });
    expect([...harness.state().expandedKeys]).toEqual([]);

    await harness.unmount();
});

async function mount() {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    let latest: WorkspaceTreeState | undefined;
    let root: Root | undefined;
    function Probe({ agentId }: { agentId: string }) {
        latest = useWorkspaceTreeState({
            ...scope,
            agentId,
            initialDirectoryPath: '',
            selectedPath: null,
        });
        return null;
    }
    let agentId = scope.agentId;
    const element = () => (
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <Probe agentId={agentId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
    return {
        // Query notifications flush on a macrotask, so let one pass inside `act`.
        act: async (run: () => void) => {
            await act(async () => {
                run();
                await nextTask();
            });
        },
        render: async (next?: { agentId: string }) => {
            agentId = next?.agentId ?? agentId;
            await act(async () => {
                root ??= createRoot(document.createElement('div') as unknown as Element);
                root.render(element());
                await nextTask();
            });
        },
        seed: (path: string, entries: WorkspaceFileEntry[]) =>
            queryClient.setQueryData(key(path), { entries }),
        state: () => {
            if (!latest) {
                throw new Error('Probe has not rendered');
            }
            return latest;
        },
        unmount: async () => {
            await act(async () => {
                root?.unmount();
                queryClient.clear();
                await nextTask();
            });
        },
    };
}

function nextTask() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function ids(nodes: WorkspaceTreeNode[]): string[] {
    return nodes.flatMap((node) => [
        node.id,
        ...ids(node.kind === 'directory' ? node.children : []),
    ]);
}

function directory(path: string): WorkspaceFileEntry {
    return {
        kind: 'directory',
        mediaType: null,
        name: path,
        path,
        sizeBytes: null,
        updatedAt: null,
    };
}

function file(path: string): WorkspaceFileEntry {
    return {
        kind: 'file',
        mediaType: 'text/markdown',
        name: path.split('/').at(-1) ?? path,
        path,
        sizeBytes: 1,
        updatedAt: '2026-06-25T00:00:00.000Z',
    };
}
