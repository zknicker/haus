import { expect, test } from 'bun:test';
import type { WorkerBranch } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderCard } from './worker-card.test-utils.tsx';
import { WorkerPullRequestRow } from './worker-card.tsx';
import { workerTurnFixture as turn, workerFixture as work } from './worker-fixture.ts';

test('a live turn with an empty composer offers Stop, and a typed follow-up would Send', () => {
    const html = renderCard(work({ updatedAt: new Date().toISOString() }));

    expect(html).toContain('aria-label="Stop Worker"');
    expect(html).toContain('placeholder="Goes in when this turn ends"');
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

test('the pull request and provider links are real links', () => {
    const html = renderCard(
        work({
            providerUrl: 'https://cursor.com/agents/bc_one',
            pullRequest: {
                additions: 1,
                changedFiles: 1,
                checks: 'passing',
                deletions: 0,
                headSha: 'abc123',
                number: 56,
                observedAt: '2026-11-05T12:00:00.000Z',
                repository: 'haus/haus',
                review: 'none',
                settledAt: null,
                source: 'github',
                state: 'open',
                title: 'Fix it',
                url: 'https://github.com/haus/haus/pull/56',
            },
        })
    );

    expect(html).toContain('href="https://github.com/haus/haus/pull/56"');
    expect(html).toContain('href="https://cursor.com/agents/bc_one"');
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
    expect(html).toContain('· Draft · 1 file');
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
