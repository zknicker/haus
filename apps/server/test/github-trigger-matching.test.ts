import { describe, expect, test } from 'bun:test';
import { type GithubTriggerEvents, githubTriggerEventsSchema } from '@haus/api';
import type { Payload } from '../src/github/event-projection/payload.ts';
import { matchesGithubEvents, repositoryInScope } from '../src/github/trigger-matching.ts';
import {
    checkSuitePayload,
    deploymentStatusPayload,
    issuesPayload,
    pullRequestPayload,
    pullRequestReviewPayload,
    pushPayload,
    releasePayload,
    workflowRunPayload,
} from './github-delivery-fixtures.ts';

function events(input: unknown): GithubTriggerEvents {
    return githubTriggerEventsSchema.parse(input);
}

type Case = [string, unknown, Parameters<typeof matchesGithubEvents>[1], Payload, boolean];

const cases: Case[] = [
    [
        'workflow_run default action is completed',
        [{ event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload(),
        true,
    ],
    [
        'workflow_run requested misses the default',
        [{ event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload({ action: 'requested' }),
        false,
    ],
    [
        'conclusion filter matches',
        [{ conclusions: ['failure', 'timed_out'], event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload(),
        true,
    ],
    [
        'conclusion filter misses success',
        [{ conclusions: ['failure'], event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload({ conclusion: 'success' }),
        false,
    ],
    [
        'conclusion filter misses a null conclusion',
        [{ conclusions: ['failure'], event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload({ conclusion: null }),
        false,
    ],
    [
        'branch filter is exact',
        [{ branches: ['main'], event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload({ branch: 'main-2' }),
        false,
    ],
    [
        'workflow file filter matches the path',
        [{ event: 'workflow_run', workflows: ['.github/workflows/ci.yml'] }],
        'workflow_run',
        workflowRunPayload(),
        true,
    ],
    [
        'filters AND across lists',
        [{ branches: ['main'], conclusions: ['success'], event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload(),
        false,
    ],
    [
        'entries OR across events',
        [{ event: 'push' }, { event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload(),
        true,
    ],
    [
        'another event never matches',
        [{ event: 'push' }],
        'workflow_run',
        workflowRunPayload(),
        false,
    ],
    [
        'check_suite conclusion',
        [{ conclusions: ['failure'], event: 'check_suite' }],
        'check_suite',
        checkSuitePayload(),
        true,
    ],
    [
        'deployment_status state and environment',
        [
            {
                environments: ['production'],
                event: 'deployment_status',
                states: ['failure', 'error'],
            },
        ],
        'deployment_status',
        deploymentStatusPayload(),
        true,
    ],
    [
        'deployment_status environment miss',
        [{ environments: ['staging'], event: 'deployment_status' }],
        'deployment_status',
        deploymentStatusPayload(),
        false,
    ],
    [
        'pull_request labels ignore case',
        [{ event: 'pull_request', labels: ['bug'] }],
        'pull_request',
        pullRequestPayload({ labels: ['Bug'] }),
        true,
    ],
    [
        'pull_request base branch miss',
        [{ baseBranches: ['release'], event: 'pull_request' }],
        'pull_request',
        pullRequestPayload(),
        false,
    ],
    [
        'authors default to collaborators',
        [{ event: 'pull_request' }],
        'pull_request',
        pullRequestPayload({ association: 'CONTRIBUTOR' }),
        false,
    ],
    [
        'authors anyone admits outsiders',
        [{ authors: 'anyone', event: 'pull_request' }],
        'pull_request',
        pullRequestPayload({ association: 'NONE' }),
        true,
    ],
    [
        'review state filter',
        [{ event: 'pull_request_review', states: ['changes_requested'] }],
        'pull_request_review',
        pullRequestReviewPayload('changes_requested'),
        true,
    ],
    [
        'review by an outsider misses the default',
        [{ event: 'pull_request_review' }],
        'pull_request_review',
        pullRequestReviewPayload('approved', 'FIRST_TIME_CONTRIBUTOR'),
        false,
    ],
    [
        'push to a filtered branch',
        [{ branches: ['main'], event: 'push' }],
        'push',
        pushPayload(),
        true,
    ],
    [
        'push tag misses a branch filter',
        [{ branches: ['main'], event: 'push' }],
        'push',
        pushPayload({ ref: 'refs/tags/main' }),
        false,
    ],
    [
        'a branch deletion never matches',
        [{ event: 'push' }],
        'push',
        pushPayload({ deleted: true }),
        false,
    ],
    [
        'issues label filter',
        [{ event: 'issues', labels: ['BUG'] }],
        'issues',
        issuesPayload(),
        true,
    ],
    [
        'issues action miss',
        [{ event: 'issues' }],
        'issues',
        issuesPayload({ action: 'closed' }),
        false,
    ],
    ['release published', [{ event: 'release' }], 'release', releasePayload(), true],
    [
        'release prereleased misses the default',
        [{ event: 'release' }],
        'release',
        releasePayload('prereleased'),
        false,
    ],
];

describe('github Trigger matching', () => {
    for (const [name, entries, event, payload, expected] of cases) {
        test(name, () => {
            expect(matchesGithubEvents(events(entries), event, payload)).toBe(expected);
        });
    }
});

test('a repository must be in the access cache and, when selected, in the selection', () => {
    const accessibleRepositoryIds = [7001, 7002];
    const installationScope = { repositoryIds: [], repositoryScope: 'installation' as const };
    const selected = { repositoryIds: [7002], repositoryScope: 'repositories' as const };
    expect(
        repositoryInScope({ accessibleRepositoryIds, repositoryId: 7001, scope: installationScope })
    ).toBe(true);
    expect(
        repositoryInScope({ accessibleRepositoryIds, repositoryId: 9999, scope: installationScope })
    ).toBe(false);
    expect(
        repositoryInScope({ accessibleRepositoryIds, repositoryId: 7001, scope: selected })
    ).toBe(false);
    expect(
        repositoryInScope({ accessibleRepositoryIds, repositoryId: 7002, scope: selected })
    ).toBe(true);
    expect(
        repositoryInScope({ accessibleRepositoryIds: [], repositoryId: 7002, scope: selected })
    ).toBe(false);
});
