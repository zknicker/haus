import { expect, test } from 'bun:test';
import {
    workerObservationSchema,
    workerPullRequestNumber,
    workerPullRequestSchema,
    workerPullRequestStates,
    workerSchema,
    formatWorkerSuffix,
} from './index.ts';
import { work } from './worker-record-fixture.ts';

const pullRequest = {
    additions: 34,
    changedFiles: 1,
    deletions: 0,
    number: 56,
    observedAt: '2026-09-05T12:00:00.000Z',
    state: 'draft',
} as const;

test("a branch may carry the Computer's own dated GitHub reading of its pull request", () => {
    const branch = {
        branch: 'cloud/fix-flake',
        pullRequestUrl: 'https://github.com/haus/haus/pull/56',
        repository: 'haus/haus',
    };
    const observation = {
        branches: [{ ...branch, pullRequest }],
        observedAt: '2026-09-05T12:00:00.000Z',
        runId: 'car_1234567890abcdef',
        status: 'completed',
        workId: 'caw_1234567890abcdef',
    };

    expect(workerObservationSchema.parse(observation).branches?.[0]?.pullRequest).toEqual(
        pullRequest
    );
    // A Run that opened nothing, or one whose pull request could not be read,
    // is the same branch report Haus always accepted.
    expect(workerObservationSchema.safeParse({ ...observation, branches: [branch] }).success).toBe(
        true
    );
    expect(
        workerObservationSchema.safeParse({
            ...observation,
            branches: [{ ...branch, pullRequest: null }],
        }).success
    ).toBe(true);
});

test('a pull-request snapshot states real counts, a live number, and a GitHub state', () => {
    for (const state of workerPullRequestStates) {
        expect(workerPullRequestSchema.parse({ ...pullRequest, state }).state).toBe(state);
    }
    expect(workerPullRequestSchema.safeParse({ ...pullRequest, state: 'reopened' }).success).toBe(
        false
    );
    expect(workerPullRequestSchema.safeParse({ ...pullRequest, number: 0 }).success).toBe(false);
    expect(workerPullRequestSchema.safeParse({ ...pullRequest, additions: -1 }).success).toBe(
        false
    );
    expect(workerPullRequestSchema.safeParse({ ...pullRequest, changedFiles: 1.5 }).success).toBe(
        false
    );
    // The reading is dated, so Server can tell a newer snapshot from an older one.
    expect(
        workerPullRequestSchema.safeParse({ ...pullRequest, observedAt: undefined }).success
    ).toBe(false);
    expect(workerPullRequestSchema.safeParse({ ...pullRequest, title: 'Fix it' }).success).toBe(
        false
    );
});

test('the work suffix names the pull request a Run opened', () => {
    expect(formatWorkerSuffix({ ...workerSchema.parse(work), pullRequestNumber: 56 })).toBe(
        ' [worker status=running title=Fix the flaky delivery test pr=#56]'
    );
    expect(workerPullRequestNumber('https://github.com/haus/haus/pull/56')).toBe(56);
    expect(workerPullRequestNumber('https://api.github.com/repos/haus/haus/pulls/56')).toBe(56);
    expect(workerPullRequestNumber('https://github.com/haus/haus/pull/56/files')).toBe(56);
    expect(workerPullRequestNumber('https://github.com/haus/haus/pull/0')).toBeNull();
    expect(workerPullRequestNumber('https://github.com/haus/haus/tree/main')).toBeNull();
    expect(workerPullRequestNumber('not a url')).toBeNull();
});
