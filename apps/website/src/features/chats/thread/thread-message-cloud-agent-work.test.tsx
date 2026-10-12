import { expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { linkedWork } from '../../../../../../packages/haus-api/src/cloud-agent-work-fixture.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { testAgent } from '../../members/agent-fixtures.ts';
import type { TranscriptMessageRow } from '../transcript-contract.ts';
import { ThreadMessageSurface } from './thread-message-surface.tsx';

const serverId = 'srv_cards';
const blippy = { ...linkedWork, agentId: 'agt_blippy', id: 'caw_blippy', title: 'Blippy job' };
const tiny = { ...linkedWork, agentId: 'agt_tiny', id: 'caw_tiny', title: 'Tiny job' };

test('every linked work renders its own card, named after its delegating Agent', () => {
    const html = render(row([blippy, tiny]));

    expect(html.match(/data-testid="cloud-agent-work-card"/g)).toHaveLength(2);
    expect(html).toContain('Cloud Agent work: Blippy job');
    expect(html).toContain('Cloud Agent work: Tiny job');
    expect(html.indexOf('Blippy job')).toBeLessThan(html.indexOf('Tiny job'));
});

test('a Message that links no work renders no card', () => {
    expect(render(row([]))).not.toContain('cloud-agent-work-card');
});

test('the card names the delegator from the work, never the linking author', () => {
    const followUp = { since: linkedWork.createdAt, state: 'waiting' as const };
    const job = { followUp, settledAt: null, startedAt: null, state: 'done' as const };
    const asked = { ...blippy, job, updatedAt: new Date().toISOString() };
    const html = render(row([asked]));

    expect(html).toContain('Blippy asked for changes');
    expect(html).not.toContain('Forge');
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
            cloudAgentWork: works,
            content: 'Tracking this here.',
            id: 'msg_link',
            sender: 'Forge',
            senderType: 'agent',
            sourceSessionKey: 'hosted:agt_forge',
            timestamp: linkedWork.createdAt,
        },
        thread: null,
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
        onboarding: { phase: 'complete' },
        role: 'member',
    } as never);
    utils.agent.list.setData({ serverId }, [
        testAgent({ displayName: 'Blippy', id: 'agt_blippy', serverId }),
        testAgent({ displayName: 'Tiny', id: 'agt_tiny', serverId }),
    ]);
    return renderToStaticMarkup(
        <Providers client={client} queryClient={queryClient}>
            <ThreadMessageSurface row={target}>{null}</ThreadMessageSurface>
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
