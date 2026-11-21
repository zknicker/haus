import { expect, test } from 'bun:test';
import type { ComputerUseRequest } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { ComputerUseRequestPanel } from './computer-use-request-panel.tsx';

const serverId = 'srv_1';

test('a steward sees the request with Deny, Always allow, and Allow', () => {
    const html = render({ canDecide: true });

    expect(html).toContain('Permission request');
    expect(html).toContain('Tiny wants to control applications on Studio Mac');
    expect(html).toContain('click');
    expect(html).toContain('desktop · @s8f3k2p9:e8');
    expect(buttons(html)).toEqual(['Deny', 'Always allow', 'Allow']);
    expect(html).not.toContain('Waiting for');
});

test('anyone else sees who the request is waiting for instead of the buttons', () => {
    const html = render({ canDecide: false });

    expect(html).toContain('Waiting for Zach');
    expect(buttons(html)).toEqual([]);
});

function buttons(html: string) {
    return [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1]);
}

function render(overrides: Partial<ComputerUseRequest>) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.agent.list.setData({ serverId }, [
        { avatarUrl: null, displayName: 'Tiny', id: 'agt_tiny' },
    ] as never);
    const request: ComputerUseRequest = {
        agentId: 'agt_tiny',
        canDecide: true,
        chatId: 'cht_ops',
        command: 'click',
        computerId: 'cmp_studio',
        computerName: 'Studio Mac',
        decidedAt: null,
        decidedByName: null,
        detail: '@s8f3k2p9:e8',
        id: 'cur_open',
        requestedAt: '2026-11-20T11:59:00.000Z',
        standing: false,
        state: 'requested',
        waitingForName: 'Zach',
        ...overrides,
    };
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <ComputerUseRequestPanel request={request} serverId={serverId} />
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
