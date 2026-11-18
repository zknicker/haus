import type { GithubTriggerEventName } from '@haus/api';
import {
    projectCheckRun,
    projectCheckSuite,
    projectDeploymentStatus,
    projectWorkflowJob,
    projectWorkflowRun,
} from './ci-events.ts';
import {
    projectIssue,
    projectPullRequest,
    projectPullRequestReview,
    projectPush,
    projectRelease,
} from './collaboration-events.ts';
import { field, login, type Payload, text } from './payload.ts';
import { serializeProjection } from './text-limits.ts';

/**
 * The trimmed, event-specific record a `github` fire stores instead of the raw
 * body (specs/github-triggers.md#projection). It is serialized once, capped at
 * the stored payload ceiling, and shared by every Trigger the delivery wakes.
 */
export interface GithubProjection {
    action: string | null;
    event: GithubTriggerEventName;
    serialized: string;
}

const projectors = {
    check_run: projectCheckRun,
    check_suite: projectCheckSuite,
    deployment_status: projectDeploymentStatus,
    issues: projectIssue,
    pull_request: projectPullRequest,
    pull_request_review: projectPullRequestReview,
    push: projectPush,
    release: projectRelease,
    workflow_job: projectWorkflowJob,
    workflow_run: projectWorkflowRun,
} satisfies Record<GithubTriggerEventName, (payload: Payload) => object>;

export function projectGithubDelivery(input: {
    /** The bound installation's account login; webhook bodies carry only its id. */
    installationAccount: string;
    event: GithubTriggerEventName;
    payload: Payload;
    /** Marks a sample projection sent by `trigger.test`. */
    test?: boolean;
}): GithubProjection {
    const { payload } = input;
    const repository = field(payload, 'repository');
    const action = text(payload, 'action');
    const projection = {
        ...(input.test ? { test: true } : {}),
        action,
        event: input.event,
        installation: { account: input.installationAccount },
        repository: {
            full_name: text(repository, 'full_name'),
            html_url: text(repository, 'html_url'),
        },
        sender: { login: login(payload, 'sender') },
        ...projectors[input.event](payload),
    };
    return { action, event: input.event, serialized: serializeProjection(projection) };
}
