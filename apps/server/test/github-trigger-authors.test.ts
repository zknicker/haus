import { describe, expect, test } from 'bun:test';
import { githubTriggerEventsSchema } from '@haus/api';
import type { Payload } from '../src/github/event-projection/payload.ts';
import { matchesGithubEvents } from '../src/github/trigger-matching.ts';
import {
    checkRunPayload,
    checkSuitePayload,
    pullRequestPayload,
    pullRequestReviewPayload,
    workflowJobPayload,
    workflowRunPayload,
} from './github-delivery-fixtures.ts';

function events(input: unknown) {
    return githubTriggerEventsSchema.parse(input);
}

type Case = [string, unknown, Parameters<typeof matchesGithubEvents>[1], Payload, boolean];

const cases: Case[] = [
    [
        'workflow_run from a fork head repository is untrusted by default',
        [{ event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload({ headRepository: 'forker/api' }),
        false,
    ],
    [
        'workflow_run authors anyone admits a fork head repository',
        [{ authors: 'anyone', event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload({ headRepository: 'forker/api' }),
        true,
    ],
    [
        'workflow_run on main triggered by a bot push passes the default gate',
        [{ event: 'workflow_run' }],
        'workflow_run',
        workflowRunPayload({
            runEvent: 'push',
            sender: { id: 41_898_282, login: 'github-actions[bot]', type: 'Bot' },
        }),
        true,
    ],
    [
        'check_suite with a null head_branch is untrusted by default (forks, tag pushes, and detached commits all report it)',
        [{ event: 'check_suite' }],
        'check_suite',
        checkSuitePayload({ headBranch: null }),
        false,
    ],
    [
        'check_run with a non-null head_branch passes by default',
        [{ event: 'check_run' }],
        'check_run',
        checkRunPayload(),
        true,
    ],
    [
        'check_run with a null head_branch is untrusted by default (forks, tag pushes, and detached commits all report it)',
        [{ event: 'check_run' }],
        'check_run',
        checkRunPayload({ headBranch: null }),
        false,
    ],
    [
        'workflow_job never passes the default gate, even same-repo: GitHub gives no fork signal',
        [{ event: 'workflow_job' }],
        'workflow_job',
        workflowJobPayload(),
        false,
    ],
    [
        'workflow_job stays untrusted with a real fork branch name, not a faked null',
        [{ event: 'workflow_job' }],
        'workflow_job',
        workflowJobPayload({ headBranch: 'forker:fix-login' }),
        false,
    ],
    [
        'workflow_job authors anyone admits it regardless of head_branch',
        [{ authors: 'anyone', event: 'workflow_job' }],
        'workflow_job',
        workflowJobPayload({ headBranch: 'forker:fix-login' }),
        true,
    ],
    [
        'pull_request authors default to collaborators',
        [{ event: 'pull_request' }],
        'pull_request',
        pullRequestPayload({ association: 'CONTRIBUTOR' }),
        false,
    ],
    [
        'pull_request authors anyone admits outsiders',
        [{ authors: 'anyone', event: 'pull_request' }],
        'pull_request',
        pullRequestPayload({ association: 'NONE' }),
        true,
    ],
    [
        'pull_request_review by an outsider misses the default',
        [{ event: 'pull_request_review' }],
        'pull_request_review',
        pullRequestReviewPayload('approved', 'FIRST_TIME_CONTRIBUTOR'),
        false,
    ],
];

describe('github Trigger author gating', () => {
    for (const [name, entries, event, payload, expected] of cases) {
        test(name, () => {
            expect(matchesGithubEvents(events(entries), event, payload)).toBe(expected);
        });
    }
});

test('push, release, and deployment_status refuse an authors field', () => {
    expect(
        githubTriggerEventsSchema.safeParse([{ authors: 'anyone', event: 'push' }]).success
    ).toBe(false);
    expect(
        githubTriggerEventsSchema.safeParse([{ authors: 'anyone', event: 'release' }]).success
    ).toBe(false);
    expect(
        githubTriggerEventsSchema.safeParse([{ authors: 'anyone', event: 'deployment_status' }])
            .success
    ).toBe(false);
});
