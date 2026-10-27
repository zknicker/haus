import { describe, expect, test } from 'bun:test';
import { cloudAgentBranchSchema } from '@haus/api';
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
    expect(cloudAgentBranchSchema.parse(branches[0])).toEqual(branches[0]);
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
