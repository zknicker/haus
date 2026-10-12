import { expect, test } from 'bun:test';
import { type GithubInstallation, githubTriggerEventsSchema } from '@haus/api';
import {
    createGithubEventDraft,
    githubEventDraftFromEntry,
    githubEventFromDraft,
    githubEventSummary,
} from './trigger-github-events-model.ts';
import {
    createGithubTriggerDraft,
    githubConfigFromDraft,
    githubInstallationOptions,
    githubInstallationRemedy,
    githubProblemFix,
    githubProblemTitle,
    githubScopeSummary,
} from './trigger-github-model.ts';

test('editing alternative groups retains every include and exclude field', () => {
    const groups = githubTriggerEventsSchema.parse([
        {
            event: 'workflow_run',
            branches: ['@default'],
            workflowsIgnore: ['**/test.yml'],
            actorsIgnore: ['dependabot[bot]'],
            repositoriesIgnore: ['acme/archive-*'],
            workflowEvents: ['push'],
        },
        { event: 'workflow_run', workflows: ['**/deploy.yml'], conclusions: ['cancelled'] },
    ]);
    const drafts = groups.map(githubEventDraftFromEntry);
    expect(drafts[0]?.key).not.toBe(drafts[1]?.key);
    expect(drafts.map(githubEventFromDraft)).toEqual(groups);
    expect(githubEventSummary(groups[0]!)).toContain('exclude repositories: acme/archive-*');
});

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

const now = Date.parse('2026-10-11T06:00:00.000Z');
const signedIn = { connected: true, grants: [{ agentId: 'agt_1' }], id: 'mcp_1' };

function options(
    installations: GithubInstallation[],
    connections: Parameters<typeof githubInstallationOptions>[0]['connections'] = [signedIn]
) {
    return githubInstallationOptions({ connections, installations }, { agentId: 'agt_1', now });
}

test('a lone usable installation is preselected; suspended ones are not offered', () => {
    expect(createGithubTriggerDraft(options([installation('ghi_a')])).installationId).toBe('ghi_a');
    expect(
        createGithubTriggerDraft(options([installation('ghi_a'), installation('ghi_b')]))
            .installationId
    ).toBeNull();
    expect(options([installation('ghi_a', 'suspended')])).toEqual([]);
});

test('an installation the Agent cannot author on is listed with what blocks it', () => {
    const blocker = (
        connections: Parameters<typeof options>[1],
        overrides: Partial<GithubInstallation> = {}
    ) => options([{ ...installation('ghi_a'), ...overrides }], connections)[0]?.blocker;

    expect(blocker([signedIn])).toBeNull();
    expect(blocker([{ ...signedIn, connected: false }])).toBe('connect_github');
    expect(blocker([])).toBe('connect_github');
    expect(blocker([signedIn], { accessSyncedAt: null })).toBe('sign_in_required');
    expect(blocker([signedIn], { accessSyncedAt: '2026-10-10T05:00:00.000Z' })).toBe(
        'sign_in_required'
    );
    expect(blocker([{ ...signedIn, grants: [{ agentId: 'agt_other' }] }])).toBe(
        'agent_access_required'
    );
    // A blocked installation is never the preselected one.
    expect(
        createGithubTriggerDraft(options([installation('ghi_a')], [{ ...signedIn, grants: [] }]))
            .installationId
    ).toBeNull();
    expect(githubInstallationRemedy('agent_access_required', 'Blippy')).toContain('Blippy');
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
