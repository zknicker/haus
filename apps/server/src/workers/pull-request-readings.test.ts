import { expect, test } from 'bun:test';
import type { WorkerOutcome } from '@haus/api';
import { reportedPullRequests } from './pull-request-readings.ts';

test('a Worker names every pull request its turns reported, once each, newest first', () => {
    const newest = {
        branches: [branch('https://github.com/haus/haus/pull/14')],
        outcome: report([
            'https://github.com/haus/haus/pull/15',
            'https://github.com/haus/haus/pull/14',
        ]),
    };
    const oldest = {
        branches: [branch('https://github.com/haus/haus/pull/12'), branch(null)],
        outcome: { kind: 'stopped' } satisfies WorkerOutcome,
    };

    expect(reportedPullRequests([newest, oldest])).toEqual([
        { number: 15, repository: 'haus/haus' },
        { number: 14, repository: 'haus/haus' },
        { number: 12, repository: 'haus/haus' },
    ]);
    expect(reportedPullRequests([{ branches: [], outcome: null }])).toEqual([]);
});

function branch(pullRequestUrl: string | null) {
    return { branch: 'haus/fix', pullRequestUrl, repository: 'haus/haus' };
}

function report(pullRequestUrls: string[]) {
    return {
        kind: 'report',
        report: {
            ask: null,
            messageId: null,
            outcome: 'done',
            personId: null,
            personRefused: null,
            pullRequestUrls,
            source: 'worker',
            text: 'Done.',
        },
    } satisfies WorkerOutcome;
}
