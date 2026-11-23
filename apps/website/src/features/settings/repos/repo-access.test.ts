import { expect, test } from 'bun:test';
import { repoAccessFix, repoFolderSummary } from './repo-access.ts';

const acme = {
    account: { id: 77, login: 'Acme', type: 'Organization' },
    githubInstallationId: 5201,
} as const;
const admin = { canInstallGithubApp: true, githubConnectionId: 'mcp_github' };
const member = { canInstallGithubApp: false, githubConnectionId: 'mcp_github' };

test('an installed owner is fixed in its installation settings on GitHub', () => {
    expect(repoAccessFix({ installation: acme, status: 'app-needs-access' }, member)).toEqual({
        kind: 'settings',
        url: 'https://github.com/organizations/Acme/settings/installations/5201',
    });
});

test('an owner with no installation is installed by an Owner or Admin, or asked for on the connection', () => {
    const access = { installation: null, status: 'app-needs-access' } as const;

    expect(repoAccessFix(access, admin)).toEqual({ connectionId: 'mcp_github', kind: 'install' });
    expect(repoAccessFix(access, member)).toEqual({
        connectionId: 'mcp_github',
        kind: 'connection',
    });
});

test('no GitHub connection sends people to Connections; ready and unavailable have nothing to fix', () => {
    expect(repoAccessFix({ status: 'github-not-connected' }, admin)).toEqual({ kind: 'connect' });
    expect(repoAccessFix({ status: 'ready' }, admin)).toBeNull();
    expect(repoAccessFix({ status: 'github-unavailable' }, admin)).toBeNull();
});

test('a repo names the Devices that hold it, and a folder that is not there', () => {
    expect(repoFolderSummary({ folders: [] })).toBe('No folders yet');
    expect(
        repoFolderSummary({
            folders: [
                { computerId: 'cmp_1', computerName: 'MacBook Pro', path: '/a', state: 'present' },
                { computerId: 'cmp_2', computerName: 'Mac mini', path: '/b', state: 'missing' },
                { computerId: 'cmp_3', computerName: null, path: '/c', state: null },
            ],
        })
    ).toBe('MacBook Pro, Mac mini (missing), Unnamed device');
});
