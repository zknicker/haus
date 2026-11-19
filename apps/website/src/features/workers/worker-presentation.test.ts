import { expect, test } from 'bun:test';
import type { WorkerTurnStatus } from '@haus/api';
import { workerTurnFixture as run, workerFixture as work } from './worker-fixture.ts';
import {
    canCancelWorker,
    workerBranchPullRequestNumber,
    workerJobChipColor,
    workerJobText,
    workerJobTone,
    workerTurnStatusLabels,
    workerBranch,
    workerText,
    formatWorkerDuration,
    quietFor,
} from './worker-presentation.ts';

const startedAt = '2026-09-04T12:00:00.000Z';
const now = Date.parse('2026-09-04T12:04:00.000Z');

test('a job whose first Run is still queued reads as working, never queued', () => {
    expect(workerJobText(work({ startedAt: null, status: 'queued' }).job, now)).toBe('Working');
});

test('a working job counts up from the moment the provider started it', () => {
    expect(workerJobText(work({ status: 'running' }).job, now)).toBe('Working · 4m');
});

test('a done job states how long it took, not how long ago it was', () => {
    const completed = work({
        turns: [run({ status: 'completed', terminalAt: '2026-09-04T13:12:00.000Z' })],
        status: 'completed',
    });

    expect(workerJobText(completed.job, now)).toBe('Done · 1h 12m');
});

test('a done job under a second or with no known span names only its outcome', () => {
    const done = (start: null | string, settledAt: null | string) =>
        workerJobText({ followUp: null, settledAt, startedAt: start, state: 'done' }, now);

    expect(done(startedAt, startedAt)).toBe('Done');
    expect(done(startedAt, '2026-09-04T12:00:00.900Z')).toBe('Done');
    expect(done(null, startedAt)).toBe('Done');
    expect(done(startedAt, null)).toBe('Done');
    expect(done(startedAt, '2026-09-04T12:00:01.000Z')).toBe('Done · 1s');
});

test('a follow-up queued behind a finished Run keeps the job done', () => {
    const followedUp = work({
        turns: [
            run({ createdAt: '2026-09-04T12:03:00.000Z', turnId: 'car_two', status: 'queued' }),
            run({ status: 'completed', terminalAt: '2026-09-04T12:02:00.000Z' }),
        ],
        startedAt: null,
        status: 'queued',
    });

    expect(workerJobText(followedUp.job, now)).toBe('Done · 2m');
});

test('a failed, cancelled, or expired job names only its outcome in Cursor’s words', () => {
    expect(workerJobText(work({ status: 'failed' }).job, now)).toBe('Failed');
    expect(workerJobText(work({ status: 'expired' }).job, now)).toBe('Expired');
    expect(workerJobText(work({ status: 'cancelled' }).job, now)).toBe('Stopped');
});

test('a cancelled or expired job is muted; the other states carry their own tone', () => {
    expect(workerJobTone('working')).toBe('accent');
    expect(workerJobTone('done')).toBe('success');
    expect(workerJobTone('failed')).toBe('danger');
    expect(workerJobTone('cancelled')).toBe('muted');
    expect(workerJobTone('expired')).toBe('muted');
    expect(workerJobChipColor('cancelled')).toBe('default');
    expect(workerJobChipColor('expired')).toBe('default');
    expect(workerJobChipColor('done')).toBe('success');
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
    const live = { cancelRequestedAt: null, status: 'running' as WorkerTurnStatus };

    expect(canCancelWorker({ ...live, role: 'owner' })).toBe(true);
    expect(canCancelWorker({ ...live, role: 'admin' })).toBe(true);
    expect(canCancelWorker({ ...live, role: 'member' })).toBe(false);
    expect(canCancelWorker({ ...live, role: 'owner', status: 'completed' })).toBe(false);
    expect(canCancelWorker({ ...live, cancelRequestedAt: startedAt, role: 'owner' })).toBe(false);
});

test('durations read coarsely, in the units a work surface states', () => {
    expect(formatWorkerDuration(-5)).toBe('0s');
    expect(formatWorkerDuration(42_000)).toBe('42s');
    expect(formatWorkerDuration(11 * 60_000)).toBe('11m');
    expect(formatWorkerDuration(60 * 60_000)).toBe('1h');
    expect(formatWorkerDuration(150 * 60_000)).toBe('2h 30m');
});

test('the branch that opened a pull request wins over the ones that did not', () => {
    const branched = work({
        turns: [
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

    expect(workerBranch(branched)?.branch).toBe('cursor/fix-migration');
});

test('a work whose branches opened nothing still names the first one', () => {
    const branched = work({
        turns: [
            run({
                branches: [
                    { branch: 'cursor/spike', pullRequestUrl: null, repository: 'haus/haus' },
                ],
            }),
        ],
    });

    expect(workerBranch(branched)?.branch).toBe('cursor/spike');
});

test('a work with no reported branch has none', () => {
    expect(workerBranch(work({}))).toBe(null);
});

test('a follow-up Run that reported nothing yet keeps the earlier pull request', () => {
    const followedUp = work({
        turns: [
            run({ turnId: 'car_two', status: 'queued' }),
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

    expect(workerBranch(followedUp)?.branch).toBe('cursor/fix-migration');
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

    expect(workerBranchPullRequestNumber(observed)).toBe(482);
    expect(workerBranchPullRequestNumber({ ...observed, pullRequest: null })).toBe(482);
    expect(
        workerBranchPullRequestNumber({
            ...observed,
            pullRequest: null,
            pullRequestUrl: 'https://gitlab.com/haus/haus/-/merge_requests/7',
        })
    ).toBe(null);
    expect(
        workerBranchPullRequestNumber({
            ...observed,
            pullRequest: null,
            pullRequestUrl: null,
        })
    ).toBe(null);
});

test('launching reads Starting, a failed launch reads Stopped, and a requested stop reads Stopping', () => {
    const starting = work({ status: 'queued', startedAt: null });
    expect(workerText(starting, now)).toBe('Starting · 4m');
    const failed = work({
        status: 'failed',
        turns: [
            run({ status: 'failed', providerRunId: null, errorCode: 'provider-launch-failed' }),
        ],
    });
    expect(workerText(failed, now)).toBe('Stopped');
    expect(workerText(work({ cancelRequestedAt: new Date(now).toISOString() }), now)).toBe(
        'Stopping'
    );
});

test('every Run status reads as a person would say it, never the wire enum', () => {
    expect(workerTurnStatusLabels.pending_input).toBe('Waiting on you');
    for (const label of Object.values(workerTurnStatusLabels)) {
        expect(label).not.toMatch(/_/u);
        expect(label.charAt(0)).toBe(label.charAt(0).toUpperCase());
    }
});
