import type { GithubTriggerEventName } from '@haus/api';
import type { TriggerSourceLines } from '../triggers/trigger-envelope.ts';
import { count, field, type Payload, text } from './event-projection/payload.ts';

// The Server-built lines a `github` fire adds to the `type=trigger` envelope
// (specs/github-triggers.md#envelope). The `GitHub:` line carries only
// enumerated values, repository names, refs, and numbers; every author-written
// field (titles, bodies, names) stays in the indented, untrusted excerpt.

const summaryMaxChars = 200;
const separator = ' · ';

export function githubEnvelopeLines(input: {
    deliveryGuid: string;
    event: GithubTriggerEventName;
    payload: Payload;
}): TriggerSourceLines {
    const action = enumerated(text(input.payload, 'action'));
    return {
        delivery: input.deliveryGuid.replace(/[^A-Za-z0-9-]/gu, '').slice(0, 64),
        eventAction: action ? `${input.event}.${action}` : input.event,
        summary: githubSummary(input.event, input.payload),
    };
}

export function githubSummary(event: GithubTriggerEventName, payload: Payload): string {
    const action = enumerated(text(payload, 'action'));
    const repo = repositoryName(text(field(payload, 'repository'), 'full_name'));
    const parts = [action ? `${event} ${action}` : event, ...summaryParts(event, payload, repo)];
    const line = parts.filter((part): part is string => Boolean(part)).join(separator);
    return line.length > summaryMaxChars ? `${line.slice(0, summaryMaxChars - 1)}…` : line;
}

function summaryParts(
    event: GithubTriggerEventName,
    payload: Payload,
    repo: string | null
): (string | null)[] {
    switch (event) {
        case 'workflow_run': {
            const run = field(payload, 'workflow_run');
            return [
                enumerated(text(run, 'conclusion')),
                ref(text(run, 'head_branch')),
                numbered(repo, count(run, 'run_number')),
            ];
        }
        case 'workflow_job':
        case 'check_suite': {
            const subject = field(payload, event);
            return [
                enumerated(text(subject, 'conclusion')),
                ref(text(subject, 'head_branch')),
                repo,
            ];
        }
        case 'check_run': {
            const run = field(payload, 'check_run');
            return [
                enumerated(text(run, 'conclusion')),
                ref(text(field(run, 'check_suite'), 'head_branch')),
                repo,
            ];
        }
        case 'deployment_status':
            return [
                enumerated(text(field(payload, 'deployment_status'), 'state')),
                ref(text(field(payload, 'deployment'), 'ref')),
                repo,
            ];
        case 'pull_request': {
            const pull = field(payload, 'pull_request');
            return [ref(text(field(pull, 'base'), 'ref')), numbered(repo, count(pull, 'number'))];
        }
        case 'pull_request_review':
            return [
                enumerated(text(field(payload, 'review'), 'state')?.toLowerCase() ?? null),
                numbered(repo, count(field(payload, 'pull_request'), 'number')),
            ];
        case 'push':
            return [ref(text(payload, 'ref')?.replace(/^refs\/heads\//u, '') ?? null), repo];
        case 'issues':
            return [numbered(repo, count(field(payload, 'issue'), 'number'))];
        case 'release':
            return [ref(text(field(payload, 'release'), 'tag_name')), repo];
        default:
            return [repo];
    }
}

/** GitHub's own vocabulary: lower-case words joined by underscores. */
function enumerated(value: string | null): string | null {
    return value && /^[a-z_]{1,40}$/u.test(value) ? value : null;
}

/** A branch or tag, reduced to characters a ref may hold and that cannot break a line. */
function ref(value: string | null): string | null {
    const cleaned = value?.replace(/[^\w./@+-]/gu, '').slice(0, 100) ?? '';
    return cleaned.length > 0 ? cleaned : null;
}

function repositoryName(value: string | null): string | null {
    return value && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/u.test(value) ? value.slice(0, 140) : null;
}

function numbered(repo: string | null, number: number | null): string | null {
    if (!repo) {
        return null;
    }
    return number !== null && Number.isInteger(number) ? `${repo} #${number}` : repo;
}
