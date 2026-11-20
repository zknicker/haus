import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { linkedWork } from '../../../../../../packages/haus-api/src/worker-fixture.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { testAgent } from '../../members/agent-fixtures.ts';
import type { TranscriptMessageRow } from '../transcript-contract.ts';
import { MessageSurface } from './message-surface.tsx';

const serverId = 'srv_cards';
const blippy = { ...linkedWork, agentId: 'agt_blippy', id: 'caw_blippy', title: 'Blippy job' };
const tiny = { ...linkedWork, agentId: 'agt_tiny', id: 'caw_tiny', title: 'Tiny job' };

test('every linked Worker renders its own row, in link order', () => {
    const html = render(row([blippy, tiny]));

    expect(html.match(/data-testid="worker-row"/g)).toHaveLength(2);
    expect(html.indexOf('Blippy job')).toBeLessThan(html.indexOf('Tiny job'));
});

test('a Message that links no Worker renders no row', () => {
    expect(render(row([]))).not.toContain('worker-row');
});

function row(works: readonly (typeof linkedWork)[]): TranscriptMessageRow {
    return {
        actor: { id: 'agt_forge', kind: 'agent' },
        connectsToNext: false,
        connectsToPrevious: false,
        id: 'msg_link',
        isFirstInGroup: true,
        kind: 'message',
        message: {
            worker: works,
            content: 'Tracking this here.',
            id: 'msg_link',
            sender: 'Forge',
            senderType: 'agent',
            sourceSessionKey: 'hosted:agt_forge',
            timestamp: linkedWork.createdAt,
        },
    };
}

function render(target: TranscriptMessageRow) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.server.bySlug.setData({ slug: 'cards' }, {
        id: serverId,
        role: 'member',
    } as never);
    utils.agent.list.setData({ serverId }, [
        testAgent({ displayName: 'Blippy', id: 'agt_blippy', serverId }),
        testAgent({ displayName: 'Tiny', id: 'agt_tiny', serverId }),
    ]);
    return renderToStaticMarkup(
        <Providers client={client} queryClient={queryClient}>
            <MessageSurface row={target}>{null}</MessageSurface>
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
                <MemoryRouter initialEntries={['/s/cards']}>
                    <Routes>
                        <Route element={children} path="/s/:slug" />
                    </Routes>
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
