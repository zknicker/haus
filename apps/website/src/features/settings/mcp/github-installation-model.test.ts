import { expect, test } from 'bun:test';
import type { Trigger } from '@haus/api';
import {
    githubInstallationSettingsUrl,
    githubInstallationStatus,
    githubRemovalBody,
    githubRepositoryScopeLabel,
    githubSetupNotice,
} from './github-installation-model.ts';

const fullPermissions = {
    actions: 'write',
    checks: 'read',
    contents: 'write',
    deployments: 'read',
    issues: 'write',
    pull_requests: 'write',
} as const;

test('an installation states its repository reach once', () => {
    expect(
        githubRepositoryScopeLabel({ accessibleRepositoryCount: 9, repositorySelection: 'all' })
    ).toBe('All repositories');
    expect(
        githubRepositoryScopeLabel({
            accessibleRepositoryCount: 1,
            repositorySelection: 'selected',
        })
    ).toBe('1 repository');
    expect(
        githubRepositoryScopeLabel({
            accessibleRepositoryCount: 4,
            repositorySelection: 'selected',
        })
    ).toBe('4 repositories');
});

test('a healthy installation carries no chip; problems name themselves', () => {
    expect(githubInstallationStatus({ permissions: fullPermissions, status: 'active' })).toBeNull();
    expect(githubInstallationStatus({ permissions: fullPermissions, status: 'suspended' })).toBe(
        'Suspended'
    );
    expect(githubInstallationStatus({ permissions: {}, status: 'removed' })).toBe('Removed');
    const { checks: _checks, ...withoutChecks } = fullPermissions;
    expect(githubInstallationStatus({ permissions: withoutChecks, status: 'active' })).toBe(
        'Permissions update needed'
    );
});

test('Configure on GitHub opens the org or user installation settings', () => {
    expect(
        githubInstallationSettingsUrl({
            account: { id: 1, login: 'acme', type: 'Organization' },
            githubInstallationId: 42,
        })
    ).toBe('https://github.com/organizations/acme/settings/installations/42');
    expect(
        githubInstallationSettingsUrl({
            account: { id: 2, login: 'zach', type: 'User' },
            githubInstallationId: 7,
        })
    ).toBe('https://github.com/settings/installations/7');
});

test('removal names every dependent Trigger', () => {
    const trigger = { title: 'CI failed' } as Trigger;
    expect(githubRemovalBody('acme', [trigger])).toStartWith('CI failed stops firing');
    expect(githubRemovalBody('acme', [])).toStartWith('No Triggers use this installation.');
});

test('the setup outcome reads as success, request, or a named refusal', () => {
    expect(githubSetupNotice('bound').status).toBe('success');
    expect(githubSetupNotice('requested').status).toBe('accent');
    expect(githubSetupNotice('github_owner_required')).toMatchObject({
        status: 'danger',
        title: 'Owner required',
    });
    expect(githubSetupNotice('something_new').status).toBe('danger');
});
