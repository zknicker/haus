import { afterAll, beforeAll, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, TRPCClientError } from '@trpc/client';
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
import { useDrivePage } from './use-drive-page.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const serverId = 'srv_1';
const agentId = 'agt_scout';
const planPath = 'agents/scout/workbench/plan.html';

test('a page card opens its Drive file at the revision the message pins', async () => {
    const harness = await mount();
    harness.seedFile(planPath, 'rev_1', { artifact_id: 'art_plan', revision_id: 'rev_1' });
    harness.seedFile(planPath, undefined, { artifact_id: 'art_plan', revision_id: 'rev_2' });

    await harness.render(
        cardTarget(
            'Plan:\n```page\n{"path":"drive/agents/scout/workbench/plan.html","revision":"rev_1"}\n```'
        )
    );
    expect(harness.page()).toMatchObject({
        artifact: { artifact_id: 'art_plan', revision_id: 'rev_1' },
        status: 'ready',
    });

    await harness.render(
        cardTarget('```page\n{"path":"drive/agents/scout/workbench/plan.html"}\n```')
    );
    expect(harness.page()).toMatchObject({
        artifact: { artifact_id: 'art_plan', revision_id: 'rev_2' },
        status: 'ready',
    });

    await harness.unmount();
});

test('a pre-Drive workbench card finds its page in the Agent area by handle', async () => {
    const harness = await mount();
    harness.seedHandle('scout');
    harness.seedFile('agents/scout/workbench/pages/fleet.html', undefined, {
        artifact_id: 'art_fleet',
        revision_id: 'rev_9',
    });

    await harness.render(cardTarget('```page\n{"path":"workbench/pages/fleet.html"}\n```'));
    expect(harness.page()).toMatchObject({
        artifact: { artifact_id: 'art_fleet', revision_id: 'rev_9' },
        status: 'ready',
    });

    await harness.unmount();
});

test('a path Drive does not hold is missing, and any other failure is not', async () => {
    const missing = await mount();
    missing.seedError(planPath, 'NOT_FOUND');
    await missing.render(
        cardTarget('```page\n{"path":"drive/agents/scout/workbench/plan.html"}\n```')
    );
    expect(missing.page()).toEqual({ status: 'missing' });
    await missing.render(cardTarget('```page\n{"path":"audits/deterministic.html"}\n```'));
    expect(missing.page()).toEqual({ status: 'missing' });
    await missing.unmount();

    const failed = await mount();
    failed.seedError(planPath, 'INTERNAL_SERVER_ERROR');
    await failed.render(
        cardTarget('```page\n{"path":"drive/agents/scout/workbench/plan.html"}\n```')
    );
    expect(failed.page()).toEqual({ status: 'failed' });
    await failed.unmount();
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
    const lookupKey = (path: string, revisionId?: string) =>
        getQueryKey(hausTrpc.artifact.byPath, { path, revision_id: revisionId, serverId }, 'query');
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
        seedError: (path: string, code: string) =>
            queryClient
                .getQueryCache()
                .build(queryClient, { queryKey: lookupKey(path) })
                .setState({
                    error: TRPCClientError.from({
                        error: { code: -32_000, data: { code }, message: code },
                    }),
                    errorUpdatedAt: Date.now(),
                    fetchStatus: 'idle',
                    status: 'error',
                }),
        seedFile: (
            path: string,
            revisionId: string | undefined,
            artifact: { artifact_id: string; revision_id: string }
        ) => queryClient.setQueryData(lookupKey(path, revisionId), { artifact }),
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
