import { expect, test } from 'bun:test';
import type { CloudAgentBranch } from '@haus/api';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';

const snapshot = {
    additions: 34,
    changedFiles: 1,
    deletions: 0,
    number: 56,
    observedAt: '2026-09-05T12:00:00.000Z',
    state: 'draft' as const,
};

const branch: CloudAgentBranch = {
    branch: 'cloud/fix-flake',
    pullRequestUrl: 'https://github.com/haus/haus/pull/56',
    repository: 'haus/haus',
};

test('a report with no snapshot never erases the one the Run already recorded', () => {
    expect(mergeBranchEvidence([{ ...branch, pullRequest: snapshot }], [branch])).toEqual([
        { ...branch, pullRequest: snapshot },
    ]);
    expect(
        mergeBranchEvidence(
            [{ ...branch, pullRequest: snapshot }],
            [{ ...branch, pullRequest: null }]
        )
    ).toEqual([{ ...branch, pullRequest: snapshot }]);
});

test('a newer reading replaces an older one and an older reading is ignored', () => {
    const merged = {
        ...snapshot,
        additions: 40,
        observedAt: '2026-09-05T12:30:00.000Z',
        state: 'merged' as const,
    };

    expect(
        mergeBranchEvidence(
            [{ ...branch, pullRequest: snapshot }],
            [{ ...branch, pullRequest: merged }]
        )
    ).toEqual([{ ...branch, pullRequest: merged }]);
    // A late report from a slower read must not walk the card backwards.
    expect(
        mergeBranchEvidence(
            [{ ...branch, pullRequest: merged }],
            [{ ...branch, pullRequest: snapshot }]
        )
    ).toEqual([{ ...branch, pullRequest: merged }]);
});

test('the branch report itself is the provider’s own current answer', () => {
    const renamed: CloudAgentBranch = { ...branch, branch: 'cloud/fix-flake-2' };

    // The recorded snapshot belongs to the branch that was read, not to the Run.
    expect(mergeBranchEvidence([{ ...branch, pullRequest: snapshot }], [renamed])).toEqual([
        renamed,
    ]);
    // A branch Cursor no longer reports is gone; nothing resurrects it.
    expect(mergeBranchEvidence([{ ...branch, pullRequest: snapshot }], [])).toEqual([]);
    // A branch reported for the first time keeps whatever it arrived with.
    expect(mergeBranchEvidence([], [{ ...branch, pullRequest: snapshot }])).toEqual([
        { ...branch, pullRequest: snapshot },
    ]);
});

test('a first report on a Run that recorded nothing still carries no snapshot', () => {
    expect(mergeBranchEvidence([], [branch])).toEqual([branch]);
});
