import { count, field, list, type Payload, pullNumbers, text } from './payload.ts';
import { clip } from './text-limits.ts';

// Projections for the CI and deployment events: what ran, where, and how it
// ended. Ids and URLs let the Agent fetch the rest through the GitHub tools.

const checkSummaryMaxChars = 2000;

export function projectWorkflowRun(payload: Payload) {
    const run = field(payload, 'workflow_run');
    return {
        workflow_run: {
            conclusion: text(run, 'conclusion'),
            display_title: text(run, 'display_title'),
            event: text(run, 'event'),
            head_branch: text(run, 'head_branch'),
            head_sha: text(run, 'head_sha'),
            html_url: text(run, 'html_url'),
            id: count(run, 'id'),
            name: text(run, 'name'),
            path: text(run, 'path'),
            pull_requests: pullNumbers(run),
            run_attempt: count(run, 'run_attempt'),
            run_number: count(run, 'run_number'),
            status: text(run, 'status'),
        },
    };
}

export function projectWorkflowJob(payload: Payload) {
    const job = field(payload, 'workflow_job');
    return {
        workflow_job: {
            conclusion: text(job, 'conclusion'),
            failed_steps: list(job, 'steps')
                .filter((step) => text(step, 'conclusion') === 'failure')
                .map((step) => text(step, 'name'))
                .filter((name): name is string => name !== null),
            head_branch: text(job, 'head_branch'),
            html_url: text(job, 'html_url'),
            id: count(job, 'id'),
            name: text(job, 'name'),
            run_id: count(job, 'run_id'),
            status: text(job, 'status'),
            workflow_name: text(job, 'workflow_name'),
        },
    };
}

export function projectCheckSuite(payload: Payload) {
    const suite = field(payload, 'check_suite');
    return {
        check_suite: {
            conclusion: text(suite, 'conclusion'),
            head_branch: text(suite, 'head_branch'),
            head_sha: text(suite, 'head_sha'),
            id: count(suite, 'id'),
            // A suite has no name, page, or output of its own; its app names it.
            name: text(field(suite, 'app'), 'name'),
            pull_requests: pullNumbers(suite),
            status: text(suite, 'status'),
        },
    };
}

export function projectCheckRun(payload: Payload) {
    const run = field(payload, 'check_run');
    const output = field(run, 'output');
    const summary = text(output, 'summary');
    return {
        check_run: {
            conclusion: text(run, 'conclusion'),
            head_branch: text(field(run, 'check_suite'), 'head_branch'),
            head_sha: text(run, 'head_sha'),
            html_url: text(run, 'html_url'),
            id: count(run, 'id'),
            name: text(run, 'name'),
            output: {
                summary: summary === null ? null : clip(summary, checkSummaryMaxChars),
                title: text(output, 'title'),
            },
            pull_requests: pullNumbers(run),
            status: text(run, 'status'),
        },
    };
}

export function projectDeploymentStatus(payload: Payload) {
    const status = field(payload, 'deployment_status');
    const deployment = field(payload, 'deployment');
    return {
        deployment_status: {
            deployment: {
                ref: text(deployment, 'ref'),
                sha: text(deployment, 'sha'),
                task: text(deployment, 'task'),
            },
            description: text(status, 'description'),
            environment: text(status, 'environment') ?? text(deployment, 'environment'),
            state: text(status, 'state'),
            target_url: text(status, 'target_url'),
        },
    };
}
