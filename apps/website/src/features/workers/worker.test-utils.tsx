import type { ChatMessage, WorkerReport } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { testAgent } from '../members/agent-fixtures.ts';

export const serverId = 'srv_cards';
export const server = { id: serverId, slug: 'cards', viewerUserId: 'usr_zach' };

export const askReport: WorkerReport = {
    ask: 'Does the iPad baseline move 2px on purpose?',
    messageId: null,
    outcome: 'needs-you',
    personId: 'usr_zach',
    personRefused: null,
    pullRequestUrls: [],
    source: 'worker',
    text: 'Fixed five of six.',
};

export function renderWorkerSurface(
    element: React.ReactNode,
    seed: {
        messages?: readonly ChatMessage[];
        task?: { chatId: null | string; id: string; key: string };
        worker?: unknown;
    } = {}
) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = hausTrpc.createClient({
        links: [() => () => observable(() => () => undefined)],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.server.bySlug.setData({ slug: 'cards' }, { ...server, role: 'member' } as never);
    utils.agent.list.setData({ serverId }, [
        testAgent({ displayName: 'Forge', id: 'agt_one', serverId }),
        testAgent({ displayName: 'Tiny', id: 'agt_tiny', serverId }),
    ]);
    utils.member.list.setData({ serverId }, {
        members: [{ displayName: 'Zach', userId: 'usr_zach' }],
        viewerRole: 'owner',
        viewerUserId: 'usr_zach',
    } as never);
    for (const message of seed.messages ?? []) {
        utils.chat.message.setData(
            { chatId: message.chatId, messageId: message.id, serverId },
            { message, tasks: [] }
        );
    }
    if (seed.task) {
        utils.task.get.setData({ serverId, taskId: seed.task.id }, seed.task as never);
    }
    if (seed.worker) {
        const worker = seed.worker as { id: string };
        utils.worker.get.setData({ serverId, workerId: worker.id }, seed.worker as never);
    }
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter initialEntries={['/s/cards']}>
                    <Routes>
                        <Route element={<Outlet context={{ server }} />} path="/s/:slug">
                            <Route element={element} index />
                        </Route>
                    </Routes>
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
