import type { GithubTriggerEvent, GithubTriggerEventName, GithubTriggerEvents } from '@haus/api';
import { githubTriggerEventNameSchema } from '@haus/api';
import { field, labelNames, type Payload, text } from './event-projection/payload.ts';

// Which `github` Triggers a delivery wakes (specs/github-triggers.md#events).
// Entries are OR'd; within one entry every present filter must pass, and a
// filter passes when any of its values matches. Absent filters match anything.

const collaboratorAssociations = new Set(['COLLABORATOR', 'MEMBER', 'OWNER']);

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

function matchesEntry(entry: GithubTriggerEvent, payload: Payload): boolean {
    const action = text(payload, 'action');
    switch (entry.event) {
        case 'workflow_run': {
            const run = field(payload, 'workflow_run');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(run, 'conclusion')) &&
                oneOf(entry.branches, text(run, 'head_branch')) &&
                oneOf(entry.workflows, text(run, 'path'))
            );
        }
        case 'workflow_job': {
            const job = field(payload, 'workflow_job');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(job, 'conclusion')) &&
                oneOf(entry.branches, text(job, 'head_branch'))
            );
        }
        case 'check_suite': {
            const suite = field(payload, 'check_suite');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(suite, 'conclusion')) &&
                oneOf(entry.branches, text(suite, 'head_branch'))
            );
        }
        case 'check_run': {
            const run = field(payload, 'check_run');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.conclusions, text(run, 'conclusion')) &&
                oneOf(entry.branches, text(field(run, 'check_suite'), 'head_branch')) &&
                oneOf(entry.checkNames, text(run, 'name'))
            );
        }
        case 'deployment_status': {
            const status = field(payload, 'deployment_status');
            return (
                oneOf(entry.states, text(status, 'state')) &&
                oneOf(
                    entry.environments,
                    text(status, 'environment') ?? text(field(payload, 'deployment'), 'environment')
                )
            );
        }
        case 'pull_request': {
            const pull = field(payload, 'pull_request');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.baseBranches, text(field(pull, 'base'), 'ref')) &&
                anyLabel(entry.labels, labelNames(pull)) &&
                authorAllowed(entry.authors, text(pull, 'author_association'))
            );
        }
        case 'pull_request_review': {
            const review = field(payload, 'review');
            return (
                oneOf(entry.actions, action) &&
                oneOf(entry.states, text(review, 'state')?.toLowerCase() ?? null) &&
                authorAllowed(entry.authors, text(review, 'author_association'))
            );
        }
        case 'push':
            return matchesPush(entry.branches, payload);
        case 'issues': {
            const issue = field(payload, 'issue');
            return (
                oneOf(entry.actions, action) &&
                anyLabel(entry.labels, labelNames(issue)) &&
                authorAllowed(entry.authors, text(issue, 'author_association'))
            );
        }
        case 'release':
            return oneOf(entry.actions, action);
        default:
            return false;
    }
}

/** A branch deletion never matches; a branch filter matches only `refs/heads/<branch>`. */
function matchesPush(branches: readonly string[] | undefined, payload: Payload): boolean {
    if (field(payload, 'deleted') === true) {
        return false;
    }
    if (!branches) {
        return true;
    }
    const ref = text(payload, 'ref');
    return ref?.startsWith('refs/heads/') === true && branches.includes(ref.slice(11));
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

function authorAllowed(authors: 'anyone' | 'collaborators', association: string | null) {
    return (
        authors === 'anyone' || (association !== null && collaboratorAssociations.has(association))
    );
}
