import { expect, test } from 'bun:test';
import { work } from './cloud-agent-fixture.ts';
import {
    cloudAgentObservationSchema,
    cloudAgentPullRequestNumber,
    cloudAgentPullRequestSchema,
    cloudAgentPullRequestStates,
    cloudAgentWorkSchema,
    formatCloudAgentWorkSuffix,
} from './index.ts';

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

    expect(cloudAgentObservationSchema.parse(observation).branches?.[0]?.pullRequest).toEqual(
        pullRequest
    );
    // A Run that opened nothing, or one whose pull request could not be read,
    // is the same branch report Haus always accepted.
    expect(
        cloudAgentObservationSchema.safeParse({ ...observation, branches: [branch] }).success
    ).toBe(true);
    expect(
        cloudAgentObservationSchema.safeParse({
            ...observation,
            branches: [{ ...branch, pullRequest: null }],
        }).success
    ).toBe(true);
});

test('a pull-request snapshot states real counts, a live number, and a GitHub state', () => {
    for (const state of cloudAgentPullRequestStates) {
        expect(cloudAgentPullRequestSchema.parse({ ...pullRequest, state }).state).toBe(state);
    }
    expect(
        cloudAgentPullRequestSchema.safeParse({ ...pullRequest, state: 'reopened' }).success
    ).toBe(false);
    expect(cloudAgentPullRequestSchema.safeParse({ ...pullRequest, number: 0 }).success).toBe(
        false
    );
    expect(cloudAgentPullRequestSchema.safeParse({ ...pullRequest, additions: -1 }).success).toBe(
        false
    );
    expect(
        cloudAgentPullRequestSchema.safeParse({ ...pullRequest, changedFiles: 1.5 }).success
    ).toBe(false);
    // The reading is dated, so Server can tell a newer snapshot from an older one.
    expect(
        cloudAgentPullRequestSchema.safeParse({ ...pullRequest, observedAt: undefined }).success
    ).toBe(false);
    expect(cloudAgentPullRequestSchema.safeParse({ ...pullRequest, title: 'Fix it' }).success).toBe(
        false
    );
});

test('the work suffix names the pull request a Run opened', () => {
    expect(
        formatCloudAgentWorkSuffix({ ...cloudAgentWorkSchema.parse(work), pullRequestNumber: 56 })
    ).toBe(' [cloud-agent-work status=running title=Fix the flaky delivery test pr=#56]');
    expect(cloudAgentPullRequestNumber('https://github.com/haus/haus/pull/56')).toBe(56);
    expect(cloudAgentPullRequestNumber('https://api.github.com/repos/haus/haus/pulls/56')).toBe(56);
    expect(cloudAgentPullRequestNumber('https://github.com/haus/haus/pull/56/files')).toBe(56);
    expect(cloudAgentPullRequestNumber('https://github.com/haus/haus/pull/0')).toBeNull();
    expect(cloudAgentPullRequestNumber('https://github.com/haus/haus/tree/main')).toBeNull();
    expect(cloudAgentPullRequestNumber('not a url')).toBeNull();
});
