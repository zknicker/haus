import { afterAll, beforeAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { pageCardTarget } from '../../features/chats/artifact-card.tsx';
import {
    bindWorkspaceTargetToAgent,
    type DrivePageTarget,
} from '../../features/chats/haus-resource-link.ts';
import { splitArtifactFences } from '../../features/servers/chat/artifact-message.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { drivePageListInput } from './drive-page.ts';
import { useDrivePage } from './use-drive-page.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const serverId = 'srv_1';
const agentId = 'agt_scout';

test('a page card opens its Drive file at the revision the message pins', async () => {
    const harness = await mount();
    harness.seedLookup('agents/scout/workbench/plan.html', [
        { artifact_id: 'art_plan', path: 'agents/scout/workbench/plan.html' },
    ]);

    await harness.render(
        cardTarget(
            'Plan:\n```page\n{"path":"drive/agents/scout/workbench/plan.html","revision":"rev_1"}\n```'
        )
    );
    expect(harness.page()).toEqual({
        artifactId: 'art_plan',
        revisionId: 'rev_1',
        status: 'ready',
    });

    await harness.render(
        cardTarget('```page\n{"path":"drive/agents/scout/workbench/plan.html"}\n```')
    );
    expect(harness.page()).toEqual({ artifactId: 'art_plan', status: 'ready' });

    await harness.unmount();
});

test('a pre-Drive workbench card finds its page in the Agent area by handle', async () => {
    const harness = await mount();
    harness.seedHandle('scout');
    harness.seedLookup('agents/scout/workbench/pages/fleet.html', [
        { artifact_id: 'art_fleet', path: 'agents/scout/workbench/pages/fleet.html' },
    ]);

    await harness.render(cardTarget('```page\n{"path":"workbench/pages/fleet.html"}\n```'));
    expect(harness.page()).toEqual({ artifactId: 'art_fleet', status: 'ready' });

    await harness.unmount();
});

test('a card whose path Drive does not hold is missing', async () => {
    const harness = await mount();
    harness.seedLookup('agents/scout/workbench/plan.html', [
        { artifact_id: 'art_plan', path: 'agents/scout/workbench/old-plan.html' },
    ]);

    await harness.render(
        cardTarget('```page\n{"path":"drive/agents/scout/workbench/plan.html"}\n```')
    );
    expect(harness.page()).toEqual({ status: 'missing' });

    await harness.render(cardTarget('```page\n{"path":"audits/deterministic.html"}\n```'));
    expect(harness.page()).toEqual({ status: 'missing' });

    await harness.unmount();
});

function cardTarget(content: string) {
    const fence = splitArtifactFences(content).find((segment) => segment.kind === 'page');
    if (fence?.kind !== 'page') {
        throw new Error('No page fence');
    }
    const target = bindWorkspaceTargetToAgent(pageCardTarget(fence.props), agentId);
    if (target.kind !== 'drivePage') {
        throw new Error('A page card opens a Drive page');
    }
    return target;
}

async function mount() {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    const client = hausTrpc.createClient({
        links: [httpBatchLink({ url: 'http://127.0.0.1:1/trpc' })],
    });
    let latest: ReturnType<typeof useDrivePage> | undefined;
    let root: Root | undefined;
    function Probe({ target }: { target: DrivePageTarget }) {
        latest = useDrivePage(serverId, target);
        return null;
    }
    return {
        page: () => latest,
        render: async (target: DrivePageTarget) => {
            await act(async () => {
                root ??= createRoot(document.createElement('div') as unknown as Element);
                root.render(
                    <QueryClientProvider client={queryClient}>
                        <hausTrpc.Provider client={client} queryClient={queryClient}>
                            <Probe target={target} />
                        </hausTrpc.Provider>
                    </QueryClientProvider>
                );
                await nextTask();
            });
        },
        seedLookup: (drivePath: string, artifacts: { artifact_id: string; path: string }[]) =>
            queryClient.setQueryData(
                getQueryKey(
                    hausTrpc.artifact.list,
                    drivePageListInput(serverId, drivePath),
                    'query'
                ),
                { artifacts }
            ),
        seedHandle: (handle: string) =>
            queryClient.setQueryData(
                getQueryKey(hausTrpc.agent.get, { agentId, serverId }, 'query'),
                { handle }
            ),
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
