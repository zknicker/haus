import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentActivityHistoryPage } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { getQueryKey } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { createQueryReconnectHandler } from '../../lib/query-reconnect-recovery.ts';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import {
    agentActivityHistoryInput,
    useAgentActivityHistory,
} from './use-agent-activity-history.ts';
import { useAgentActivityPreview } from './use-agent-activity-preview.ts';
import { agentTurnsInput, useAgentTurns } from './use-agent-turns.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const serverId = 'srv_one';
const agentId = 'agt_ada';
const emptyPage: AgentActivityHistoryPage = { events: [], nextBefore: null, runTriggers: [] };

test('a profile mounted on a fresh cache reads and subscribes to nothing', async () => {
    const harness = await mount();
    expect(harness.paths()).toEqual([]);
    await harness.unmount();
});

test('only a reconnect after a gap refetches the mounted history reads', async () => {
    const harness = await mount();
    const handle = createQueryReconnectHandler({
        onReconnect: () => void harness.queryClient.invalidateQueries({ refetchType: 'active' }),
        onStateChange: () => undefined,
    });

    handle('connected');
    await harness.settle();
    expect(harness.paths()).toEqual([]);

    handle('reconnecting');
    handle('connected');
    await harness.settle();
    expect([...harness.paths()].sort()).toEqual([
        'agent.activityHistory',
        'agent.activityHistory',
        'agent.turns',
    ]);
    await harness.unmount();
});

const responses: Record<string, () => unknown> = {
    'agent.activityHistory': () => emptyPage,
    'agent.turns': () => [],
};

async function mount() {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const paths: string[] = [];
    const link: TRPCLink<never> =
        () =>
        ({ op }) =>
            observable((observer) => {
                paths.push(op.path);
                const respond = responses[op.path];
                const timer = setTimeout(() => {
                    if (!respond) {
                        observer.error(new Error(`Unexpected ${op.path}`) as never);
                        return;
                    }
                    observer.next({ result: { data: respond() } });
                    observer.complete();
                }, 1);
                return () => clearTimeout(timer);
            });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // A cache another surface just filled: fresh under the synced-snapshot policy.
    queryClient.setQueryData(
        getQueryKey(
            hausTrpc.agent.activityHistory,
            agentActivityHistoryInput(serverId, agentId),
            'query'
        ),
        emptyPage
    );
    queryClient.setQueryData(
        getQueryKey(hausTrpc.agent.activityHistory, { agentId, limit: 5, serverId }, 'query'),
        emptyPage
    );
    queryClient.setQueryData(
        getQueryKey(hausTrpc.agent.turns, agentTurnsInput(serverId, agentId), 'query'),
        []
    );
    const client = hausTrpc.createClient({ links: [link as never] });
    function Probe() {
        useAgentActivityHistory(serverId, agentId);
        useAgentTurns(serverId, agentId);
        useAgentActivityPreview(serverId, agentId);
        return null;
    }
    let root: Root | undefined;
    await act(async () => {
        root = createRoot(document.createElement('div') as unknown as Element);
        root.render(
            <QueryClientProvider client={queryClient}>
                <hausTrpc.Provider client={client} queryClient={queryClient}>
                    <Probe />
                </hausTrpc.Provider>
            </QueryClientProvider>
        );
    });
    const settle = async () => {
        for (let pass = 0; pass < 5; pass += 1) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
            });
        }
    };
    await settle();
    return {
        paths: () => paths,
        queryClient,
        settle,
        unmount: async () => {
            await act(async () => {
                root?.unmount();
                queryClient.clear();
            });
        },
    };
}
