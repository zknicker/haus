import type { GithubTriggerEvent, GithubTriggerEventName, GithubTriggerEvents } from '@haus/api';
import { githubTriggerEventNameSchema } from '@haus/api';
import { field, labelNames, type Payload, text } from './event-projection/payload.ts';
import { matchesSelection } from './trigger-pattern.ts';

// Which `github` Triggers a delivery wakes (specs/github-triggers.md#events).
// Entries are OR'd; within one entry every present filter must pass, and a
// filter passes when any of its values matches. Absent filters match anything.

const collaboratorAssociations = new Set(['COLLABORATOR', 'MEMBER', 'OWNER']);

// `push`, `release`, and `deployment_status` get no `authors` gate: GitHub's
// own access control already gates who can cause those events to exist (a
// fork can't push to the base repo, publish its release, or deploy it).
// Narrow further with `actors`/`actorsIgnore`, already on every event.

/** A delivery's event when it is one a `github` Trigger may listen to. */
export function triggerEventName(event: string): GithubTriggerEventName | null {
    const parsed = githubTriggerEventNameSchema.safeParse(event);
    return parsed.success ? parsed.data : null;
}

/** True when any of the Trigger's event entries matches this delivery. */
export function matchesGithubEvents(
    events: GithubTriggerEvents,
    event: GithubTriggerEventName,
    payload: Payload
): boolean {
    return events.some((entry) => entry.event === event && matchesEntry(entry, payload));
}

/**
 * A delivery's repository is visible to a Trigger only inside the
 * connection user's access cache and, for a repository-scoped Trigger, among
 * its selected repositories.
 */
export function repositoryInScope(input: {
    accessibleRepositoryIds: readonly number[];
    repositoryId: number;
    scope: { repositoryIds: readonly number[]; repositoryScope: 'installation' | 'repositories' };
}): boolean {
    if (!input.accessibleRepositoryIds.includes(input.repositoryId)) {
        return false;
    }
    return (
        input.scope.repositoryScope === 'installation' ||
        input.scope.repositoryIds.includes(input.repositoryId)
    );
}

export function matchesGithubGroup(
    entry: GithubTriggerEvent,
    event: GithubTriggerEventName,
    payload: Payload
): boolean {
    return entry.event === event && matchesEntry(entry, payload);
}

function matchesEntry(entry: GithubTriggerEvent, payload: Payload): boolean {
    const action = text(payload, 'action');
    const repository = field(payload, 'repository');
    if (
        !(
            matchesSelection(
                entry.repositories,
                entry.repositoriesIgnore,
                text(repository, 'full_name')
            ) &&
            matchesSelection(
                entry.actors,
                entry.actorsIgnore,
                text(field(payload, 'sender'), 'login')
            )
        )
    ) {
        return false;
    }
    const defaultBranch = text(repository, 'default_branch');
    switch (entry.event) {
        case 'workflow_run': {
            const run = field(payload, 'workflow_run');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(run, 'conclusion')) &&
                matchesSelection(
                    entry.branches,
                    entry.branchesIgnore,
                    text(run, 'head_branch'),
                    defaultBranch
                ) &&
                matchesSelection(entry.workflows, entry.workflowsIgnore, text(run, 'path')) &&
                oneOf(entry.workflowEvents, text(run, 'event')) &&
                authorAllowed(
                    entry.authors,
                    sameRepository(
                        text(field(run, 'head_repository'), 'full_name'),
                        text(repository, 'full_name')
                    )
                )
            );
        }
        case 'workflow_job': {
            const job = field(payload, 'workflow_job');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(job, 'conclusion')) &&
                matchesSelection(
                    entry.branches,
                    entry.branchesIgnore,
                    text(job, 'head_branch'),
                    defaultBranch
                ) &&
                authorAllowed(entry.authors, workflowJobTrusted)
            );
        }
        case 'check_suite': {
            const suite = field(payload, 'check_suite');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(suite, 'conclusion')) &&
                matchesSelection(
                    entry.branches,
                    entry.branchesIgnore,
                    text(suite, 'head_branch'),
                    defaultBranch
                ) &&
                authorAllowed(entry.authors, checkTrusted(text(suite, 'head_branch')))
            );
        }
        case 'check_run': {
            const run = field(payload, 'check_run');
            const headBranch = text(field(run, 'check_suite'), 'head_branch');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(run, 'conclusion')) &&
                matchesSelection(entry.branches, entry.branchesIgnore, headBranch, defaultBranch) &&
                matchesSelection(entry.checkNames, entry.checkNamesIgnore, text(run, 'name')) &&
                authorAllowed(entry.authors, checkTrusted(headBranch))
            );
        }
        case 'deployment_status': {
            const status = field(payload, 'deployment_status');
            return (
                oneOf(entry.states, text(status, 'state')) &&
                matchesSelection(
                    entry.environments,
                    entry.environmentsIgnore,
                    text(status, 'environment') ?? text(field(payload, 'deployment'), 'environment')
                )
            );
        }
        case 'pull_request': {
            const pull = field(payload, 'pull_request');
            return (
                oneOf(entry.actions, action) &&
                matchesSelection(
                    entry.baseBranches,
                    entry.baseBranchesIgnore,
                    text(field(pull, 'base'), 'ref'),
                    defaultBranch
                ) &&
                anyLabel(entry.labels, labelNames(pull)) &&
                authorAllowed(entry.authors, associationTrusted(text(pull, 'author_association')))
            );
        }
        case 'pull_request_review': {
            const review = field(payload, 'review');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.states, text(review, 'state')?.toLowerCase() ?? null) &&
                authorAllowed(entry.authors, associationTrusted(text(review, 'author_association')))
            );
        }
        case 'push':
            return matchesPush(entry.branches, entry.branchesIgnore, payload, defaultBranch);
        case 'issues': {
            const issue = field(payload, 'issue');
            return (
                oneOf(entry.actions, action) &&
                anyLabel(entry.labels, labelNames(issue)) &&
                authorAllowed(entry.authors, associationTrusted(text(issue, 'author_association')))
            );
        }
        case 'release':
            return oneOf(entry.actions, action);
        default:
            return false;
    }
}

/** A branch deletion never matches; a branch filter matches only `refs/heads/<branch>`. */
function matchesPush(
    branches: readonly string[] | undefined,
    ignored: readonly string[] | undefined,
    payload: Payload,
    defaultBranch: string | null
): boolean {
    if (field(payload, 'deleted') === true) {
        return false;
    }
    const ref = text(payload, 'ref');
    if (!(branches || ignored)) {
        return true;
    }
    return (
        ref?.startsWith('refs/heads/') === true &&
        matchesSelection(branches, ignored, ref.slice(11), defaultBranch)
    );
}

function oneOf(values: readonly string[] | undefined, value: string | null): boolean {
    return values === undefined || (value !== null && values.includes(value));
}

/** Labels compare without case: GitHub treats `Bug` and `bug` as the same label. */
function anyLabel(filter: readonly string[] | undefined, labels: readonly string[]): boolean {
    if (!filter) {
        return true;
    }
    const wanted = new Set(filter.map((label) => label.toLowerCase()));
    return labels.some((label) => wanted.has(label.toLowerCase()));
}

function authorAllowed(authors: 'anyone' | 'collaborators', trusted: boolean): boolean {
    return authors === 'anyone' || trusted;
}

function associationTrusted(association: string | null): boolean {
    return association !== null && collaboratorAssociations.has(association);
}

/**
 * `workflow_run` is the only CI event that reports a head repository; it is
 * trusted when that matches the base repository the workflow ran in.
 */
function sameRepository(headFullName: string | null, baseFullName: string | null): boolean {
    return headFullName !== null && baseFullName !== null && headFullName === baseFullName;
}

/**
 * `workflow_job` reports no `head_repository`, and GitHub's own documented
 * null-on-fork `head_branch` behavior covers only `check_suite`/`check_run`
 * (confirmed against GitHub's Checks API docs) — a fork PR's `workflow_job`
 * carries the fork's real branch name, non-null, so treating a non-null
 * `head_branch` as trusted would do nothing. With no reliable signal in the
 * payload, `workflow_job` is untrusted under the default gate; `authors:
 * anyone` is the only way to receive it.
 */
const workflowJobTrusted = false;

/**
 * `check_suite`/`check_run` report a null `head_branch` when their commit
 * lives only in a fork (GitHub's own documented behavior), but the same null
 * also shows up for a tag push and a detached-commit check — GitHub has no
 * per-event field that tells these apart. So a default-gated `check_suite` or
 * `check_run` Trigger also misses tag- and detached-commit-triggered checks,
 * not only fork ones; `authors: anyone` or a matching `actors` entry gets
 * them back. Documented in specs/github-triggers.md#events and the website's
 * Authors hint rather than solved here, since nothing in the payload
 * distinguishes the two.
 */
function checkTrusted(headBranch: string | null): boolean {
    return headBranch !== null;
}
