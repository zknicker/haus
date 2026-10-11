import { expect, test } from 'bun:test';
import type { GithubInstallation } from '@haus/api';
import {
    createGithubEventDraft,
    githubEventFromDraft,
    githubEventSummary,
} from './trigger-github-events-model.ts';
import {
    createGithubTriggerDraft,
    githubConfigFromDraft,
    githubProblemFix,
    githubProblemTitle,
    githubScopeSummary,
} from './trigger-github-model.ts';

function installation(
    id: string,
    status: GithubInstallation['status'] = 'active'
): GithubInstallation {
    return {
        accessibleRepositoryCount: 3,
        accessSyncedAt: '2026-10-11T00:00:00.000Z',
        account: { id: 1, login: 'acme', type: 'Organization' },
        connectionId: 'mcp_1',
        createdAt: '2026-10-11T00:00:00.000Z',
        githubInstallationId: 42,
        id,
        permissions: {},
        removedAt: null,
        repositorySelection: 'all',
        status,
        updatedAt: '2026-10-11T00:00:00.000Z',
    };
}

test('a lone active installation is preselected; suspended ones are not offered', () => {
    expect(createGithubTriggerDraft([installation('ghi_a')]).installationId).toBe('ghi_a');
    expect(
        createGithubTriggerDraft([installation('ghi_a'), installation('ghi_b')]).installationId
    ).toBeNull();
    expect(
        createGithubTriggerDraft([installation('ghi_a', 'suspended')]).installationId
    ).toBeNull();
});

test('a new event entry starts on its default actions', () => {
    expect(createGithubEventDraft('workflow_run').actions).toEqual(['completed']);
    expect(createGithubEventDraft('pull_request').actions).toEqual(['opened']);
    expect(createGithubEventDraft('push').actions).toEqual([]);
});

test('filters are comma-separated text until submit; empty filters are omitted', () => {
    const draft = {
        ...createGithubEventDraft('workflow_run'),
        choices: { conclusions: ['failure'] },
        texts: { branches: ' main, release ,main', workflows: '' },
    };
    expect(githubEventFromDraft(draft)).toEqual({
        actions: ['completed'],
        branches: ['main', 'release'],
        conclusions: ['failure'],
        event: 'workflow_run',
    });
});

test('an event entry with no actions left cannot be sent', () => {
    expect(githubEventFromDraft({ ...createGithubEventDraft('issues'), actions: [] })).toBeNull();
});

test('the configuration waits for an installation, events, and selected repositories', () => {
    const base = {
        events: [createGithubEventDraft('push')],
        installationId: 'ghi_a',
        repositories: [],
        scope: 'installation' as const,
    };
    expect(githubConfigFromDraft({ ...base, installationId: null })).toBeNull();
    expect(githubConfigFromDraft({ ...base, events: [] })).toBeNull();
    expect(githubConfigFromDraft({ ...base, scope: 'repositories' })).toBeNull();
    expect(githubConfigFromDraft(base)).toEqual({
        events: [{ event: 'push' }],
        installationId: 'ghi_a',
        repositories: { scope: 'installation' },
    });
    expect(
        githubConfigFromDraft({ ...base, repositories: ['acme/api'], scope: 'repositories' })
            ?.repositories
    ).toEqual({ names: ['acme/api'], scope: 'repositories' });
});

test('the detail reads each event as what it narrows to', () => {
    expect(
        githubEventSummary({
            actions: ['completed'],
            branches: ['main'],
            conclusions: ['failure'],
            event: 'workflow_run',
        })
    ).toBe('completed · failure · main');
    expect(githubEventSummary({ event: 'push' })).toBe('Any');
    expect(
        githubEventSummary({ actions: ['opened'], authors: 'anyone', event: 'pull_request' })
    ).toBe('opened · any author');
    expect(githubScopeSummary({ repositories: { scope: 'installation' } })).toBe(
        'All accessible repositories'
    );
});

test('every problem has a title and a fix naming who acts', () => {
    expect(githubProblemTitle('agent_access_revoked')).toBe('Agent access revoked');
    expect(
        githubProblemFix('agent_access_revoked', { agentName: 'Blippy', login: 'acme' })
    ).toContain('Blippy');
    expect(
        githubProblemFix('installation_suspended', { agentName: 'Blippy', login: 'acme' })
    ).toContain('acme');
});
