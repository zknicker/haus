import { expect, test } from 'bun:test';
import type { Worker, WorkerBranch, WorkerReport } from '@haus/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { observable } from '@trpc/server/observable';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { linkedMessage } from '../../../../../packages/haus-api/src/worker-fixture.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { TranscriptRenderProvider } from '../chats/chat-transcript-render-context.tsx';
import { testAgent } from '../members/agent-fixtures.ts';
import { WorkerCard, WorkerPullRequestRow } from './worker-card.tsx';
import { workerTurnFixture as turn, workerFixture as work } from './worker-fixture.ts';

const serverId = 'srv_cards';
const askReport: WorkerReport = {
    ask: 'Does the iPad baseline move 2px on purpose?',
    messageId: null,
    outcome: 'needs-you',
    personId: 'usr_zach',
    personRefused: null,
    pullRequestUrls: [],
    source: 'worker',
    text: 'Fixed five of six.',
};

test('a live turn with an empty composer offers Stop, and a typed follow-up would Send', () => {
    const html = renderCard(work({ updatedAt: new Date().toISOString() }));

    expect(html).toContain('aria-label="Stop Worker"');
    expect(html).toContain('placeholder="Goes in when this turn ends"');
});

test('a needs-you report shows its text and the ask with its person, and invites an answer', () => {
    const html = renderCard(
        work({
            turns: [
                turn({
                    outcome: { kind: 'report', report: askReport },
                    status: 'pending_input',
                }),
            ],
        })
    );

    expect(html).toContain('Fixed five of six.');
    expect(html).toContain('@Zach ');
    expect(html).toContain('Does the iPad baseline move 2px on purpose?');
    expect(html).toContain('placeholder="Answer this Worker"');
    expect(html).toContain('aria-label="Send follow-up"');
    expect(html).not.toContain('worker-status-line');
});

test('a cited Drive file opens at the revision the report cited', () => {
    const report = { ...askReport, messageId: 'msg_report' };
    const html = renderCard(
        work({
            turns: [turn({ outcome: { kind: 'report', report }, status: 'pending_input' })],
        }),
        {
            ...linkedMessage,
            driveCitations: [
                {
                    artifactId: 'art_render',
                    path: 'agents/forge/renders/ENG-41/composer.png',
                    revisionId: 'rev_two',
                },
                {
                    artifactId: null,
                    path: 'agents/forge/reports/ENG-41/notes.md',
                    revisionId: null,
                },
            ],
            id: 'msg_report',
        }
    );

    expect(html).toContain('href="/s/cards/artifacts/art_render?revision=rev_two"');
    expect(html).toContain('composer.png');
    expect(html).toContain('notes.md');
});

test('a history Worker outside any Task keeps Copy link and has no composer', () => {
    const html = renderCard(
        work({ closedAt: '2026-09-04T12:03:00.000Z', status: 'completed', taskId: null })
    );

    expect(html).toContain('Copy link');
    expect(html).not.toContain('prompt-input');
});

test('a follow-up from another Agent is attributed to that Agent, not the delegator', () => {
    const fromTiny = {
        at: '2026-09-04T12:02:00.000Z',
        author: { id: 'agt_tiny', kind: 'agent' as const },
        kind: 'follow-up' as const,
        messageId: null,
        text: 'Narrow it down.',
    };
    const html = renderCard(
        work({
            turns: [turn({ input: [fromTiny], status: 'running' })],
            updatedAt: new Date().toISOString(),
        })
    );

    expect(html).toContain('On Tiny&#x27;s follow-up');
});

test('a pull request only the report named still shows, numbered when GitHub names it', () => {
    expect(
        renderToStaticMarkup(
            <WorkerPullRequestRow
                branch={null}
                reportUrls={['https://github.com/haus/haus/pull/7']}
            />
        )
    ).toContain('PR #7');
    expect(
        renderToStaticMarkup(
            <WorkerPullRequestRow branch={null} reportUrls={['https://git.example.com/mr/7']} />
        )
    ).toContain('Pull request');
});

test('on a narrow pane the card in the Task transcript still shows cited files', () => {
    const report = { ...askReport, messageId: 'msg_report' };
    const html = renderCard(
        work({ turns: [turn({ outcome: { kind: 'report', report }, status: 'pending_input' })] }),
        {
            ...linkedMessage,
            driveCitations: [
                { artifactId: 'art_render', path: 'a/render.png', revisionId: 'rev_two' },
            ],
            id: 'msg_report',
        },
        { inTranscript: true }
    );

    expect(html).toContain('render.png');
});

test('a closed Worker shows its record with no composer', () => {
    const html = renderCard(work({ closedAt: '2026-09-04T12:03:00.000Z', status: 'completed' }));

    expect(html).toContain('data-testid="worker-card"');
    expect(html).not.toContain('prompt-input');
});

const pullRequestBranch: WorkerBranch = {
    branch: 'cursor/test',
    pullRequest: {
        additions: 10,
        changedFiles: 1,
        deletions: 0,
        number: 1,
        observedAt: '2026-09-04T12:00:00.000Z',
        state: 'draft',
    },
    pullRequestUrl: 'https://github.com/haus/haus/pull/1',
    repository: 'haus/haus',
};

test('the pull request row states number, state, and diff size', () => {
    const html = renderToStaticMarkup(<WorkerPullRequestRow branch={pullRequestBranch} />);

    expect(html).toContain('PR #1');
    expect(html).toContain(' · Draft · 1 file');
    expect(html).toContain('+10');
    expect(html).toContain('−0');
});

test('a pull request without a GitHub reading still states its number', () => {
    const html = renderToStaticMarkup(
        <WorkerPullRequestRow branch={{ ...pullRequestBranch, pullRequest: null }} />
    );

    expect(html).toContain('PR #1');
    expect(html).not.toContain('Draft');
});

test('the live reading replaces the snapshot the Run froze at', () => {
    const html = renderToStaticMarkup(
        <WorkerPullRequestRow
            branch={pullRequestBranch}
            reading={{
                additions: 90,
                changedFiles: 7,
                checks: 'passing',
                deletions: 5,
                headSha: 'abc123',
                number: 56,
                observedAt: '2026-11-05T12:00:00.000Z',
                repository: 'haus/haus',
                review: 'approved',
                settledAt: '2026-11-05T12:00:00.000Z',
                source: 'github',
                state: 'merged',
                title: 'Fix it',
                url: 'https://github.com/haus/haus/pull/56',
            }}
        />
    );

    expect(html).toContain('Merged');
    expect(html).toContain('7 files');
});

test('a branch that opened no pull request renders no row', () => {
    expect(
        renderToStaticMarkup(
            <WorkerPullRequestRow
                branch={{ ...pullRequestBranch, pullRequest: null, pullRequestUrl: null }}
            />
        )
    ).toBe('');
});

function renderCard(
    worker: Worker,
    reportMessage?: typeof linkedMessage,
    options: { inTranscript?: boolean } = {}
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
                                    <WorkerCard chatId="cht_task" work={worker} />
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
