import type { GithubTriggerEvent } from '@haus/api';

/**
 * A minimal, plausible webhook body for one Trigger event entry, used by
 * `trigger.test` so a test fire carries the same projection shape a real
 * delivery would. Values are obviously sample data (`#0`, `sample`).
 */
export function sampleGithubPayload(entry: GithubTriggerEvent, repository: string) {
    const [owner = 'sample'] = repository.split('/');
    const common = {
        repository: { full_name: repository, html_url: `https://github.com/${repository}` },
        sender: { login: owner },
    };
    const action = 'actions' in entry ? entry.actions[0] : undefined;
    const branch = firstOf(entry, 'branches') ?? firstOf(entry, 'baseBranches') ?? 'main';
    const conclusion = firstOf(entry, 'conclusions') ?? 'failure';
    switch (entry.event) {
        case 'workflow_run':
            return {
                ...common,
                action,
                workflow_run: {
                    conclusion,
                    head_branch: branch,
                    id: 0,
                    name: 'Sample workflow',
                    path: firstOf(entry, 'workflows') ?? '.github/workflows/sample.yml',
                    run_number: 0,
                    status: 'completed',
                },
            };
        case 'workflow_job':
            return {
                ...common,
                action,
                workflow_job: { conclusion, head_branch: branch, id: 0, name: 'sample' },
            };
        case 'check_suite':
            return { ...common, action, check_suite: { conclusion, head_branch: branch, id: 0 } };
        case 'check_run':
            return {
                ...common,
                action,
                check_run: {
                    check_suite: { head_branch: branch },
                    conclusion,
                    id: 0,
                    name: firstOf(entry, 'checkNames') ?? 'sample',
                },
            };
        case 'deployment_status':
            return {
                ...common,
                action: 'created',
                deployment: { environment: 'sample', ref: branch },
                deployment_status: {
                    environment: firstOf(entry, 'environments') ?? 'sample',
                    state: firstOf(entry, 'states') ?? 'failure',
                },
            };
        case 'pull_request':
            return {
                ...common,
                action,
                pull_request: { base: { ref: branch }, number: 0, title: 'Sample pull request' },
            };
        case 'pull_request_review':
            return {
                ...common,
                action,
                pull_request: { number: 0, title: 'Sample pull request' },
                review: { state: firstOf(entry, 'states') ?? 'approved' },
            };
        case 'push':
            return { ...common, commits: [], ref: `refs/heads/${branch}` };
        case 'issues':
            return { ...common, action, issue: { number: 0, title: 'Sample issue' } };
        case 'release':
            return { ...common, action, release: { name: 'Sample release', tag_name: 'v0.0.0' } };
        default:
            return common;
    }
}

function firstOf(entry: GithubTriggerEvent, key: string): string | undefined {
    const values = (entry as Record<string, unknown>)[key];
    return Array.isArray(values) && typeof values[0] === 'string' ? values[0] : undefined;
}
