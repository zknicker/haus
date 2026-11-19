import { describe, expect, test } from 'bun:test';
import { workerBranchSchema, workerProviderResultMaxLength } from '@haus/api';
import { boundedReport, boundedSummary } from '../report-text.ts';
import { branchesOf, observationOf, repositoryOf } from './status.ts';

describe('a Cursor repository reference reads back as one repository label', () => {
    const cases: [string, string | null][] = [
        // The shape a live Run's Git metadata actually reports.
        ['github.com/merchbaseco/tmterminal', 'merchbaseco/tmterminal'],
        ['https://github.com/merchbaseco/tmterminal', 'merchbaseco/tmterminal'],
        ['https://github.com/merchbaseco/tmterminal.git', 'merchbaseco/tmterminal'],
        ['https://github.com/merchbaseco/tmterminal/', 'merchbaseco/tmterminal'],
        ['https://github.com/merchbaseco/tmterminal.git/', 'merchbaseco/tmterminal'],
        ['http://www.github.com/merchbaseco/tmterminal', 'merchbaseco/tmterminal'],
        ['https://user@github.com/merchbaseco/tmterminal.git', 'merchbaseco/tmterminal'],
        ['ssh://git@github.com:22/merchbaseco/tmterminal.git', 'merchbaseco/tmterminal'],
        ['git@github.com:merchbaseco/tmterminal.git', 'merchbaseco/tmterminal'],
        ['git@github.com:merchbaseco/tmterminal', 'merchbaseco/tmterminal'],
        ['  github.com/merchbaseco/tmterminal  ', 'merchbaseco/tmterminal'],
        ['merchbaseco/tmterminal', 'merchbaseco/tmterminal'],
        // Off GitHub the host stays, so the branch survives as evidence.
        [
            'https://gitlab.com/merchbaseco/tools/tmterminal.git',
            'gitlab.com/merchbaseco/tools/tmterminal',
        ],
        ['git@bitbucket.org:merchbaseco/tmterminal.git', 'bitbucket.org/merchbaseco/tmterminal'],
        // Nothing that names a repository.
        ['https://github.com/merchbaseco', null],
        ['tmterminal', null],
        ['', null],
    ];

    for (const [repoUrl, expected] of cases) {
        test(`${repoUrl || '<empty>'} reads as ${expected ?? 'nothing'}`, () => {
            expect(repositoryOf(repoUrl)).toBe(expected);
        });
    }
});

test('a reported branch reaches the observation with its pull request', () => {
    const branches = branchesOf([
        {
            branch: 'cursor/fix-readme-mcp-status-a8b3',
            prUrl: 'https://github.com/merchbaseco/tmterminal/pull/55',
            repoUrl: 'github.com/merchbaseco/tmterminal',
        },
    ]);

    expect(branches).toEqual([
        {
            branch: 'cursor/fix-readme-mcp-status-a8b3',
            pullRequestUrl: 'https://github.com/merchbaseco/tmterminal/pull/55',
            repository: 'merchbaseco/tmterminal',
        },
    ]);
    // Server stores exactly this, parsed by exactly this schema.
    expect(workerBranchSchema.parse(branches[0])).toEqual(branches[0]);
});

test('a branch off GitHub keeps its host-qualified repository', () => {
    expect(
        branchesOf([
            {
                branch: 'cursor/fix',
                prUrl: null,
                repoUrl: 'https://gitlab.com/merchbaseco/tools/tmterminal.git',
            },
        ])
    ).toEqual([
        {
            branch: 'cursor/fix',
            pullRequestUrl: null,
            repository: 'gitlab.com/merchbaseco/tools/tmterminal',
        },
    ]);
});

test('a branch Cursor reports without a branch name is dropped', () => {
    expect(
        branchesOf([{ branch: null, prUrl: null, repoUrl: 'github.com/merchbaseco/tmterminal' }])
    ).toEqual([]);
});

test('a result past the summary limit but under the report cap truncates only the summary', () => {
    const text = 'Fixed the flaky test. '.repeat(200); // 4600 chars: over workerSummaryMaxLength, under the report cap
    const observation = observationOf(
        {
            branches: [],
            errorCode: null,
            errorMessage: null,
            rawStatus: 'FINISHED',
            result: text,
            runId: 'run_long',
            usage: null,
        },
        { agentId: 'bc_long', observedAt: '2026-10-26T23:06:00.000Z' }
    );

    const expectedReport = boundedReport(text);
    expect(observation.report).toEqual(expectedReport);
    expect(observation.report?.clipped).toBe(false);
    expect(observation.summary).toBe(boundedSummary(expectedReport));
    expect(observation.summary).not.toBe(text);
    expect(observation.summary?.endsWith('…')).toBe(true);
});

test('a result past the report’s own hard cap is clipped the same way Claude’s path would clip it', () => {
    const text = 'x'.repeat(workerProviderResultMaxLength + 1000);
    const observation = observationOf(
        {
            branches: [],
            errorCode: null,
            errorMessage: null,
            rawStatus: 'FINISHED',
            result: text,
            runId: 'run_huge',
            usage: null,
        },
        { agentId: 'bc_huge', observedAt: '2026-10-26T23:06:00.000Z' }
    );

    expect(observation.report).toEqual(boundedReport(text));
    expect(observation.report?.clipped).toBe(true);
    expect(observation.report?.text).toHaveLength(workerProviderResultMaxLength);
    expect(observation.summary).toBe(boundedSummary(boundedReport(text)));
});

test('an error message with no result also becomes the report and summary', () => {
    const observation = observationOf(
        {
            branches: [],
            errorCode: 'provider_error',
            errorMessage: 'The provider could not start the Agent.',
            rawStatus: 'ERROR',
            result: null,
            runId: 'run_error',
            usage: null,
        },
        { agentId: 'bc_error', observedAt: '2026-10-26T23:06:00.000Z' }
    );

    expect(observation.report).toEqual({
        clipped: false,
        text: 'The provider could not start the Agent.',
    });
    expect(observation.summary).toBe('The provider could not start the Agent.');
    expect(observation.result).toBeNull();
});

test('a finished run carries its final answer with the Haus lines read and its pull request', () => {
    const observation = observationOf(
        {
            branches: [
                {
                    branch: 'cursor/fix-race',
                    prUrl: 'https://github.com/merchbaseco/tmterminal/pull/55',
                    repoUrl: 'github.com/merchbaseco/tmterminal',
                },
            ],
            errorCode: null,
            errorMessage: null,
            rawStatus: 'FINISHED',
            result: 'Fixed the race.\n\nThe flake came from an unawaited close.\n\nHaus-Outcome: done',
            runId: 'run_done',
            usage: null,
        },
        { agentId: 'bc_done', observedAt: '2026-10-26T23:06:00.000Z' }
    );

    expect(observation.result).toEqual({
        outcome: 'done',
        personHandle: null,
        pullRequestUrls: ['https://github.com/merchbaseco/tmterminal/pull/55'],
        text: 'Fixed the race.\n\nThe flake came from an unawaited close.',
    });
});

test('a run still working carries no final answer', () => {
    const observation = observationOf(
        {
            branches: [],
            errorCode: null,
            errorMessage: null,
            rawStatus: 'RUNNING',
            result: null,
            runId: 'run_working',
            usage: null,
        },
        { agentId: 'bc_working', observedAt: '2026-10-26T23:06:00.000Z' }
    );

    expect(observation).not.toHaveProperty('result');
});

test('a Run first read after sleep retains its provider start time', () => {
    const startedAt = '2026-10-26T22:23:00.000Z';
    const observation = observationOf(
        {
            branches: [],
            errorCode: null,
            errorMessage: null,
            rawStatus: 'RUNNING',
            result: null,
            runId: 'run_sleep',
            startedAt,
            usage: null,
        },
        { agentId: 'bc_sleep', observedAt: '2026-10-26T23:06:00.000Z' }
    );
    expect(observation).toMatchObject({ startedAt });
});
