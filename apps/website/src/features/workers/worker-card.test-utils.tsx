import type { Worker, WorkerReport } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { linkedMessage } from '../../../../../packages/haus-api/src/worker-fixture.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { TranscriptRenderProvider } from '../chats/chat-transcript-render-context.tsx';
import { testAgent } from '../members/agent-fixtures.ts';
import { WorkerCard } from './worker-card.tsx';

const serverId = 'srv_cards';
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

export function renderCard(
    worker: Worker,
    reportMessage?: typeof linkedMessage,
    options: { chatId?: null; inTranscript?: boolean } = {}
) {
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
        slug: 'cards',
    } as never);
    utils.agent.list.setData({ serverId }, [
        testAgent({ displayName: 'Forge', id: 'agt_one', serverId }),
        testAgent({ displayName: 'Tiny', id: 'agt_tiny', serverId }),
    ]);
    if (reportMessage) {
        utils.chat.message.setData(
            { chatId: 'cht_task', messageId: reportMessage.id, serverId },
            { message: reportMessage, tasks: [] }
        );
    }
    utils.member.list.setData(
        { serverId },
        {
            members: [
                {
                    avatarUrl: null,
                    description: null,
                    displayName: 'Zach',
                    email: null,
                    handle: null,
                    joinedAt: '2026-09-04T12:00:00.000Z',
                    role: 'owner',
                    timezone: null,
                    userId: 'usr_zach',
                },
            ],
            viewerRole: 'owner',
            viewerUserId: 'usr_zach',
        }
    );
    return renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
            <hausTrpc.Provider client={client} queryClient={queryClient}>
                <MemoryRouter initialEntries={['/s/cards']}>
                    <Routes>
                        <Route
                            element={
                                options.inTranscript ? (
                                    <TranscriptRenderProvider
                                        value={
                                            {
                                                chatId: 'cht_task',
                                                repliedRunIds: new Set(),
                                            } as never
                                        }
                                    >
                                        <WorkerCard work={worker} />
                                    </TranscriptRenderProvider>
                                ) : (
                                    <WorkerCard
                                        chatId={options.chatId === null ? null : 'cht_task'}
                                        work={worker}
                                    />
                                )
                            }
                            path="/s/:slug"
                        />
                    </Routes>
                </MemoryRouter>
            </hausTrpc.Provider>
        </QueryClientProvider>
    );
}
