import { expect, test } from 'bun:test';
import type { CloudAgentStatus } from '@haus/api';
import {
    canCancelCloudAgentWork,
    cloudAgentBranchPullRequestNumber,
    cloudAgentJobChipColor,
    cloudAgentJobText,
    cloudAgentJobTone,
    cloudAgentWorkBranch,
    formatCloudAgentDuration,
    quietFor,
} from './cloud-agent-presentation.ts';
import {
    cloudAgentRunFixture as run,
    cloudAgentWorkFixture as work,
} from './cloud-agent-work-fixture.ts';

const startedAt = '2026-09-04T12:00:00.000Z';
const now = Date.parse('2026-09-04T12:04:00.000Z');

test('a job whose first Run is still queued reads as working, never queued', () => {
    expect(cloudAgentJobText(work({ startedAt: null, status: 'queued' }).job, now)).toBe('Working');
});

test('a working job counts up from the moment the provider started it', () => {
    expect(cloudAgentJobText(work({ status: 'running' }).job, now)).toBe('Working · 4m');
});

test('a done job states how long it took, not how long ago it was', () => {
    const completed = work({
        runs: [run({ status: 'completed', terminalAt: '2026-09-04T13:12:00.000Z' })],
        status: 'completed',
    });

    expect(cloudAgentJobText(completed.job, now)).toBe('Done · 1h 12m');
});

test('a follow-up queued behind a finished Run keeps the job done', () => {
    const followedUp = work({
        runs: [
            run({ createdAt: '2026-09-04T12:03:00.000Z', runId: 'car_two', status: 'queued' }),
            run({ status: 'completed', terminalAt: '2026-09-04T12:02:00.000Z' }),
        ],
        startedAt: null,
        status: 'queued',
    });

    expect(cloudAgentJobText(followedUp.job, now)).toBe('Done · 2m');
});

test('a failed, cancelled, or expired job names only its outcome in Cursor’s words', () => {
    expect(cloudAgentJobText(work({ status: 'failed' }).job, now)).toBe('Failed');
    expect(cloudAgentJobText(work({ status: 'expired' }).job, now)).toBe('Expired');
    expect(cloudAgentJobText(work({ status: 'cancelled' }).job, now)).toBe('Cancelled');
});

test('a cancelled or expired job is muted; the other states carry their own tone', () => {
    expect(cloudAgentJobTone('working')).toBe('accent');
    expect(cloudAgentJobTone('done')).toBe('success');
    expect(cloudAgentJobTone('failed')).toBe('danger');
    expect(cloudAgentJobTone('cancelled')).toBe('muted');
    expect(cloudAgentJobTone('expired')).toBe('muted');
    expect(cloudAgentJobChipColor('cancelled')).toBe('default');
    expect(cloudAgentJobChipColor('expired')).toBe('default');
    expect(cloudAgentJobChipColor('done')).toBe('success');
});

test('any live Run that has not reported for ten minutes reads as stale', () => {
    const quiet = work({ status: 'running', updatedAt: '2026-09-04T11:50:00.000Z' });

    expect(quietFor(quiet, now)).toBe(14 * 60_000);
    // A follow-up waiting in the queue is live too.
    expect(quietFor({ ...quiet, status: 'queued' }, now)).toBe(14 * 60_000);
    expect(quietFor({ ...quiet, updatedAt: '2026-09-04T12:03:00.000Z' }, now)).toBeNull();
    // A settled work is not quiet; it is finished.
    expect(quietFor({ ...quiet, status: 'completed' }, now)).toBeNull();
});

test('only an Owner or Admin may cancel, and only a live, uncancelled Run', () => {
    const live = { cancelRequestedAt: null, status: 'running' as CloudAgentStatus };

    expect(canCancelCloudAgentWork({ ...live, role: 'owner' })).toBe(true);
    expect(canCancelCloudAgentWork({ ...live, role: 'admin' })).toBe(true);
    expect(canCancelCloudAgentWork({ ...live, role: 'member' })).toBe(false);
    expect(canCancelCloudAgentWork({ ...live, role: 'owner', status: 'completed' })).toBe(false);
    expect(canCancelCloudAgentWork({ ...live, cancelRequestedAt: startedAt, role: 'owner' })).toBe(
        false
    );
});

test('durations read coarsely, in the units a work surface states', () => {
    expect(formatCloudAgentDuration(-5)).toBe('0s');
    expect(formatCloudAgentDuration(42_000)).toBe('42s');
    expect(formatCloudAgentDuration(11 * 60_000)).toBe('11m');
    expect(formatCloudAgentDuration(60 * 60_000)).toBe('1h');
    expect(formatCloudAgentDuration(150 * 60_000)).toBe('2h 30m');
});

test('the branch that opened a pull request wins over the ones that did not', () => {
    const branched = work({
        runs: [
            run({
                branches: [
                    { branch: 'cursor/spike', pullRequestUrl: null, repository: 'haus/haus' },
                    {
                        branch: 'cursor/fix-migration',
                        pullRequestUrl: 'https://github.com/haus/haus/pull/482',
                        repository: 'haus/haus',
                    },
                ],
            }),
        ],
    });

    expect(cloudAgentWorkBranch(branched)?.branch).toBe('cursor/fix-migration');
});

test('a work whose branches opened nothing still names the first one', () => {
    const branched = work({
        runs: [
            run({
                branches: [
                    { branch: 'cursor/spike', pullRequestUrl: null, repository: 'haus/haus' },
                ],
            }),
        ],
    });

    expect(cloudAgentWorkBranch(branched)?.branch).toBe('cursor/spike');
});

test('a work with no reported branch has none', () => {
    expect(cloudAgentWorkBranch(work({}))).toBe(null);
});

test('a follow-up Run that reported nothing yet keeps the earlier pull request', () => {
    const followedUp = work({
        runs: [
            run({ runId: 'car_two', status: 'queued' }),
            run({
                branches: [
                    {
                        branch: 'cursor/fix-migration',
                        pullRequestUrl: 'https://github.com/haus/haus/pull/482',
                        repository: 'haus/haus',
                    },
                ],
            }),
        ],
        status: 'queued',
    });

    expect(cloudAgentWorkBranch(followedUp)?.branch).toBe('cursor/fix-migration');
});

test('a branch names its pull request from the snapshot, then from its URL', () => {
    const observed = {
        branch: 'cursor/fix-migration',
        pullRequest: {
            additions: 5743,
            changedFiles: 47,
            deletions: 2,
            number: 482,
            observedAt: startedAt,
            state: 'open' as const,
        },
        pullRequestUrl: 'https://github.com/haus/haus/pull/482',
        repository: 'haus/haus',
    };

    expect(cloudAgentBranchPullRequestNumber(observed)).toBe(482);
    expect(cloudAgentBranchPullRequestNumber({ ...observed, pullRequest: null })).toBe(482);
    expect(
        cloudAgentBranchPullRequestNumber({
            ...observed,
            pullRequest: null,
            pullRequestUrl: 'https://gitlab.com/haus/haus/-/merge_requests/7',
        })
    ).toBe(null);
    expect(
        cloudAgentBranchPullRequestNumber({
            ...observed,
            pullRequest: null,
            pullRequestUrl: null,
        })
    ).toBe(null);
});
