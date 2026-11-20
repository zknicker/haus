import { expect, test } from 'bun:test';
import type { WorkerBranch } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkerPullRequestRow } from './worker-pull-request-row.tsx';

const branch: WorkerBranch = {
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

test('the pull request row links its number and states its facts', () => {
    const html = renderToStaticMarkup(<WorkerPullRequestRow branch={branch} />);

    expect(html).toContain('href="https://github.com/haus/haus/pull/1"');
    expect(html).toContain('PR #1');
    expect(html).toContain('· Draft · 1 file');
});

test('a pull request only a report named still shows, numbered when GitHub names it', () => {
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
    expect(renderToStaticMarkup(<WorkerPullRequestRow branch={null} />)).toBe('');
});
