import { expect, test } from 'bun:test';

import type { CloudAgentBranch } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';

import { CloudAgentPullRequestRow } from './cloud-agent-work-card.tsx';

const pullRequestBranch: CloudAgentBranch = {
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
    const html = renderToStaticMarkup(<CloudAgentPullRequestRow branch={pullRequestBranch} />);

    expect(html).toContain('PR #1');
    expect(html).toContain(' · Draft · 1 file');
    expect(html).toContain('+10');
    expect(html).toContain('−0');
});

test('a pull request without a GitHub reading still states its number', () => {
    const html = renderToStaticMarkup(
        <CloudAgentPullRequestRow branch={{ ...pullRequestBranch, pullRequest: null }} />
    );

    expect(html).toContain('PR #1');
    expect(html).not.toContain('Draft');
});

test('the live reading replaces the snapshot the Run froze at', () => {
    const html = renderToStaticMarkup(
        <CloudAgentPullRequestRow
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
            <CloudAgentPullRequestRow
                branch={{ ...pullRequestBranch, pullRequest: null, pullRequestUrl: null }}
            />
        )
    ).toBe('');
});
