import { expect, test } from 'bun:test';
import { githubTriggerEventsSchema } from '@haus/api';
import { matchesGithubEvents } from '../src/github/trigger-matching.ts';
import { matchesPattern, matchesSelection } from '../src/github/trigger-pattern.ts';

test('bounded wildcards preserve literal punctuation and path segments', () => {
    expect(matchesPattern('acme/*', 'acme/api')).toBe(true);
    expect(matchesPattern('release/*', 'release/a/b')).toBe(false);
    expect(matchesPattern('release/**', 'release/a/b')).toBe(true);
    expect(matchesPattern('ci-?', 'ci-a')).toBe(true);
    expect(matchesPattern('ci-?', 'ci-ab')).toBe(false);
    expect(matchesPattern('dependabot[bot]', 'dependabot[bot]')).toBe(true);
    expect(matchesPattern('ci.yml', 'ciXyml')).toBe(false);
    expect(matchesPattern('*a'.repeat(100), `${'a'.repeat(1000)}b`)).toBe(false);
    expect(matchesSelection(['@default'], undefined, 'main', 'main')).toBe(true);
    expect(matchesSelection(['@default'], undefined, 'main', null)).toBe(false);
    expect(matchesSelection(['@default'], undefined, '@default')).toBe(true);
    expect(matchesSelection(['**'], ['release/**'], 'release/v1')).toBe(false);
    expect(matchesSelection(['**'], undefined, null)).toBe(false);
});

test('Forge can express deploy and CI policies in alternative workflow groups', () => {
    const groups = githubTriggerEventsSchema.parse([
        {
            event: 'workflow_run',
            branches: ['@default'],
            repositoriesIgnore: ['acme/archived-*'],
            workflows: ['.github/workflows/deploy.yml'],
            conclusions: ['failure', 'cancelled', 'timed_out'],
        },
        {
            event: 'workflow_run',
            branches: ['@default'],
            workflows: ['.github/workflows/quality.yml'],
            conclusions: ['failure', 'timed_out'],
            actorsIgnore: ['dependabot[bot]'],
            workflowEvents: ['push'],
        },
    ]);
    const payload = {
        action: 'completed',
        repository: { default_branch: 'trunk', full_name: 'acme/api' },
        sender: { login: 'octocat' },
        workflow_run: {
            head_branch: 'trunk',
            path: '.github/workflows/deploy.yml',
            conclusion: 'cancelled',
            event: 'push',
        },
    };
    expect(matchesGithubEvents(groups, 'workflow_run', payload)).toBe(true);
    const ci = {
        ...payload,
        workflow_run: { ...payload.workflow_run, path: '.github/workflows/quality.yml' },
    };
    expect(matchesGithubEvents(groups, 'workflow_run', ci)).toBe(false);
    const failure = { ...ci, workflow_run: { ...ci.workflow_run, conclusion: 'failure' } };
    expect(matchesGithubEvents(groups, 'workflow_run', failure)).toBe(true);
    expect(
        matchesGithubEvents(groups, 'workflow_run', {
            ...failure,
            sender: { login: 'dependabot[bot]' },
        })
    ).toBe(false);
    expect(
        matchesGithubEvents(groups, 'workflow_run', {
            ...payload,
            repository: { ...payload.repository, full_name: 'acme/archived-api' },
        })
    ).toBe(false);
    expect(
        matchesGithubEvents(groups, 'workflow_run', {
            ...failure,
            workflow_run: { ...failure.workflow_run, event: 'pull_request' },
        })
    ).toBe(false);
});

test('branch exclusions keep tags out and missing default branches fail closed', () => {
    const groups = githubTriggerEventsSchema.parse([
        { event: 'push', branchesIgnore: ['release/**'] },
    ]);
    expect(matchesGithubEvents(groups, 'push', { ref: 'refs/heads/main' })).toBe(true);
    expect(matchesGithubEvents(groups, 'push', { ref: 'refs/heads/release/a' })).toBe(false);
    expect(matchesGithubEvents(groups, 'push', { ref: 'refs/tags/main' })).toBe(false);
    expect(
        matchesGithubEvents(
            githubTriggerEventsSchema.parse([{ event: 'push', branches: ['@default'] }]),
            'push',
            { ref: 'refs/heads/main' }
        )
    ).toBe(false);
});
