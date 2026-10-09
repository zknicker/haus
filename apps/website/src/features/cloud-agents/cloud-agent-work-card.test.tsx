import { expect, test } from 'bun:test';
import type { CloudAgentBranch } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloudAgentPullRequestRow } from './cloud-agent-work-card.tsx';
import {
    cloudAgentRunFixture as run,
    cloudAgentWorkFixture as work,
} from './cloud-agent-work-fixture.ts';
import { ThreadCloudAgentRows } from './thread-cloud-agent-rows.tsx';

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

test('each job gets its own row named after its title, with no click target', () => {
    const html = renderToStaticMarkup(
        <ThreadCloudAgentRows
            works={[
                work({ id: 'caw_a', title: 'First repo', updatedAt: new Date().toISOString() }),
                work({
                    id: 'caw_b',
                    runs: [run({ branches: [pullRequestBranch], status: 'completed' })],
                    status: 'completed',
                    title: 'Second repo',
                }),
            ]}
        />
    );

    expect(html.match(/data-testid="thread-cloud-agent-row"/g)).toHaveLength(2);
    expect(html).toContain('First repo');
    expect(html).toContain('Second repo');
    expect(html).toContain('>#1</span>');
    expect(html).not.toContain('file changed');
    expect(html).not.toContain('agents');
    expect(html).not.toContain('text-xs');
    expect(html).toContain('height:20px;width:20px');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a ');
});

test('thread rows show the job, never a queued follow-up', () => {
    const followedUp = work({
        runs: [run({ runId: 'car_two', status: 'queued' }), run({ status: 'completed' })],
        status: 'queued',
        updatedAt: new Date().toISOString(),
    });
    for (const [value, label] of [
        [work({ status: 'completed' }), 'Done'],
        [work({ status: 'failed' }), 'Failed'],
        [work({ status: 'cancelled' }), 'Cancelled'],
        [work({ status: 'expired' }), 'Expired'],
        [followedUp, 'Done'],
    ] as const) {
        const html = renderToStaticMarkup(<ThreadCloudAgentRows works={[value]} />);
        expect(html).toContain(label);
        expect(html).not.toContain('Queued');
    }
});

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

test('a branch that opened no pull request renders no row', () => {
    expect(
        renderToStaticMarkup(
            <CloudAgentPullRequestRow
                branch={{ ...pullRequestBranch, pullRequest: null, pullRequestUrl: null }}
            />
        )
    ).toBe('');
});
