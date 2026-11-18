import { expect, test } from 'bun:test';
import type { CloudAgentPullRequest } from '@haus/api';
import type { CloudAgentProviderObservation } from '../provider.ts';
import { carriesPullRequest, withPullRequestEvidence } from './observation-evidence.ts';
import type { PullRequestReader } from './pull-request-reader.ts';

const snapshot: CloudAgentPullRequest = {
    additions: 34,
    changedFiles: 1,
    deletions: 0,
    number: 56,
    observedAt: '2026-09-05T12:00:00.000Z',
    state: 'draft',
};

const settled: CloudAgentProviderObservation = {
    branches: [
        { branch: 'cloud/no-pr', pullRequestUrl: null, repository: 'haus/haus' },
        {
            branch: 'cloud/fix-flake',
            pullRequestUrl: 'https://github.com/haus/haus/pull/56',
            repository: 'haus/haus',
        },
    ],
    observedAt: '2026-09-05T12:00:00.000Z',
    status: 'completed',
};

function reader(read: PullRequestReader['read']): PullRequestReader {
    return { read };
}

test('only an observation naming a pull request is worth a GitHub read', () => {
    expect(carriesPullRequest(settled)).toBe(true);
    expect(carriesPullRequest({ observedAt: '2026-09-05T12:00:00.000Z', status: 'running' })).toBe(
        false
    );
    expect(
        carriesPullRequest({
            branches: [{ branch: 'cloud/no-pr', pullRequestUrl: null, repository: 'haus/haus' }],
            observedAt: '2026-09-05T12:00:00.000Z',
            status: 'completed',
        })
    ).toBe(false);
});

test('the read attaches its snapshot to the branch that opened the pull request', async () => {
    const urls: string[] = [];
    const reported = await withPullRequestEvidence(
        settled,
        reader((url) => {
            urls.push(url);
            return Promise.resolve(snapshot);
        })
    );

    expect(urls).toEqual(['https://github.com/haus/haus/pull/56']);
    expect(reported.branches?.[1]).toEqual({
        branch: 'cloud/fix-flake',
        pullRequest: snapshot,
        pullRequestUrl: 'https://github.com/haus/haus/pull/56',
        repository: 'haus/haus',
    });
    // The branch that opened nothing is untouched.
    expect(reported.branches?.[0]).toEqual({
        branch: 'cloud/no-pr',
        pullRequestUrl: null,
        repository: 'haus/haus',
    });
});

test('a pull request that cannot be read reports exactly what the provider reported', async () => {
    expect(
        await withPullRequestEvidence(
            settled,
            reader(() => Promise.resolve(null))
        )
    ).toEqual(settled);
});

test('an observation with no pull request is reported without asking GitHub anything', async () => {
    const running: CloudAgentProviderObservation = {
        observedAt: '2026-09-05T12:00:00.000Z',
        status: 'running',
    };
    let reads = 0;

    expect(
        await withPullRequestEvidence(
            running,
            reader(() => {
                reads += 1;
                return Promise.resolve(snapshot);
            })
        )
    ).toEqual(running);
    expect(reads).toBe(0);
});
