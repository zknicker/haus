import { expect, test } from 'bun:test';
import {
    computerAddRepoFolderResultSchema,
    repoGithubAccessSchema,
    repoListSchema,
} from './repo-list.ts';

const installation = {
    account: { id: 77, login: 'Acme', type: 'Organization' },
    githubInstallationId: 5201,
} as const;

test('App access is one of four states, and only app-needs-access names an installation', () => {
    expect(repoGithubAccessSchema.parse({ status: 'ready' })).toEqual({ status: 'ready' });
    expect(
        repoGithubAccessSchema.parse({ installation: null, status: 'app-needs-access' })
    ).toEqual({ installation: null, status: 'app-needs-access' });
    expect(repoGithubAccessSchema.parse({ installation, status: 'app-needs-access' })).toEqual({
        installation,
        status: 'app-needs-access',
    });
    expect(repoGithubAccessSchema.safeParse({ installation, status: 'ready' }).success).toBe(false);
    expect(repoGithubAccessSchema.safeParse({ status: 'app-needs-access' }).success).toBe(false);
    expect(repoGithubAccessSchema.safeParse({ status: 'unknown' }).success).toBe(false);
});

test('a listed repo carries its folders with a state or null, lower-cased', () => {
    const list = repoListSchema.parse({
        canInstallGithubApp: false,
        githubConnectionId: null,
        repos: [
            {
                folders: [
                    {
                        computerId: 'cmp_studio',
                        computerName: 'Studio',
                        path: '/Users/ada/src/widgets',
                        state: 'present',
                    },
                    { computerId: 'cmp_mini', computerName: null, path: '/srv/w', state: null },
                ],
                githubAccess: { status: 'github-not-connected' },
                repository: 'Acme/Widgets',
            },
        ],
    });

    expect(list.repos[0]?.repository).toBe('acme/widgets');
    expect(
        repoListSchema.safeParse({
            ...list,
            repos: [{ ...list.repos[0], folders: [{ ...list.repos[0]?.folders[0], path: 'w' }] }],
        }).success
    ).toBe(false);
});

test('adding a folder answers its App access with the repo it names', () => {
    const added = {
        added: true,
        githubAccess: { status: 'github-unavailable' },
        path: '/Users/ada/src/widgets',
        repository: 'acme/widgets',
    } as const;

    expect(computerAddRepoFolderResultSchema.parse(added)).toEqual(added);
    expect(
        computerAddRepoFolderResultSchema.safeParse({ ...added, githubAccess: undefined }).success
    ).toBe(false);
});
