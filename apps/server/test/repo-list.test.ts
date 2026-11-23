import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type RepoFolderAnswer, repoListSchema } from '@haus/api';
import { hashComputerSecret } from '../src/computers/service.ts';
import { connectComputer, type FrameClient } from './agent-invocations.fixture.ts';
import { type GithubFixture, startGithubFixture } from './github-fixture.ts';

const secret = 'repo-list-computer-secret-0123456789abcdef';
const selected = 5201;
const everything = 5202;
const offlineId = 'cmp_repolistoffline0';
let fixture: GithubFixture;
const computerId = 'cmp_repoliststudio00';
let computer: FrameClient;
const answered = new Set<unknown>();

beforeAll(async () => {
    fixture = await startGithubFixture('repo_list');
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${fixture.serverId}, ${fixture.ownerUserId},
                ${hashComputerSecret(secret)}, ${{ name: 'Studio', runtimes: [] }}::jsonb, 'offline')
    `;
    fixture.fake.installations.set(selected, {
        account: { id: 77, login: 'Acme', type: 'Organization' },
        id: selected,
    });
    fixture.fake.installationRepositories.set(selected, ['widgets']);
    fixture.fake.installations.set(everything, {
        account: { id: 78, login: 'ada', type: 'User' },
        id: everything,
        repository_selection: 'all',
    });
    await insertInstallation('ghi_repolistacme0001', selected, 77, 'Acme', 'selected');
    await insertInstallation('ghi_repolistada00001', everything, 78, 'ada', 'all');
    for (const repository of ['acme/widgets', 'acme/hidden', 'ada/notes', 'stranger/tools']) {
        await fixture.harness.sql`
            insert into repos (server_id, repository) values (${fixture.serverId}, ${repository})
        `;
    }
    for (const repository of ['acme/widgets', 'acme/hidden', 'ada/notes']) {
        await fixture.harness.sql`
            insert into repo_folders (server_id, computer_id, repository, path)
            values (${fixture.serverId}, ${computerId}, ${repository}, ${`/Users/ada/src/${repository}`})
        `;
    }
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${offlineId}, ${fixture.serverId}, ${fixture.ownerUserId}, ${'c'.repeat(64)},
                ${{ name: 'Mac mini', runtimes: [] }}::jsonb, 'offline')
    `;
    await fixture.harness.sql`
        insert into repo_folders (server_id, computer_id, repository, path)
        values (${fixture.serverId}, ${offlineId}, 'ada/notes', '/Users/ada/notes')
    `;
    computer = await connectComputer(fixture.harness, secret);
});

afterAll(async () => {
    computer?.close();
    await fixture?.close();
});

test("repo.list names each repo's folders, their state on online Devices, and the Haus GitHub App's access", async () => {
    const listing = fixture.owner.trpc.repo.list.query({ serverId: fixture.serverId });
    const check = await answerNext({
        kind: 'check',
        states: [
            { path: '/Users/ada/src/acme/hidden', state: 'present' },
            { path: '/Users/ada/src/acme/widgets', state: 'missing' },
            { path: '/Users/ada/src/ada/notes', state: 'present' },
        ],
    });
    const listed = await listing;

    expect(check.operation).toMatchObject({ kind: 'check' });
    expect(repoListSchema.parse(listed)).toEqual(listed);
    expect(listed.canInstallGithubApp).toBe(true);
    expect(listed.githubConnectionId).toBe(fixture.connectionId);
    const acme = {
        account: { id: 77, login: 'Acme', type: 'Organization' },
        githubInstallationId: selected,
    };
    expect(listed.repos).toEqual([
        {
            folders: [folder('acme/hidden', 'present')],
            githubAccess: { installation: acme, status: 'app-needs-access' },
            repository: 'acme/hidden',
        },
        {
            folders: [folder('acme/widgets', 'missing')],
            githubAccess: { status: 'ready' },
            repository: 'acme/widgets',
        },
        {
            folders: [
                folder('ada/notes', 'present'),
                {
                    computerId: offlineId,
                    computerName: 'Mac mini',
                    path: '/Users/ada/notes',
                    state: null,
                },
            ],
            githubAccess: { status: 'ready' },
            repository: 'ada/notes',
        },
        {
            folders: [],
            githubAccess: { installation: null, status: 'app-needs-access' },
            repository: 'stranger/tools',
        },
    ]);
});

test('adding a folder answers the App access for the repo it names', async () => {
    const adding = fixture.owner.trpc.computer.addRepoFolder.mutate({
        computerId,
        path: '/Users/ada/src/gadgets',
        serverId: fixture.serverId,
    });
    await answerNext({ kind: 'inspect', path: '/Users/ada/src/gadgets', repository: 'Acme/Gadgets' });

    expect(await adding).toEqual({
        added: true,
        githubAccess: {
            installation: {
                account: { id: 77, login: 'Acme', type: 'Organization' },
                githubInstallationId: selected,
            },
            status: 'app-needs-access',
        },
        path: '/Users/ada/src/gadgets',
        repository: 'acme/gadgets',
    });
});

test('a Server without a GitHub connection says so for every repo', async () => {
    await fixture.harness.sql`
        update mcp_connections set preset = null where id = ${fixture.connectionId}
    `;
    const listing = fixture.owner.trpc.repo.list.query({ serverId: fixture.serverId });
    await answerNext({ kind: 'check', states: [] });
    const listed = await listing;
    await fixture.harness.sql`
        update mcp_connections set preset = 'github' where id = ${fixture.connectionId}
    `;

    expect(listed.canInstallGithubApp).toBe(false);
    expect(listed.githubConnectionId).toBeNull();
    expect(new Set(listed.repos.map((repo) => repo.githubAccess.status))).toEqual(
        new Set(['github-not-connected'])
    );
});

function folder(repository: string, state: string) {
    return {
        computerId,
        computerName: 'Studio',
        path: `/Users/ada/src/${repository}`,
        state,
    };
}

async function answerNext(answer: RepoFolderAnswer) {
    const request = await computer.next(
        (frame) => frame.type === 'repo-folder-request' && !answered.has(frame.requestId)
    );
    answered.add(request.requestId);
    computer.send({ answer, requestId: request.requestId, type: 'repo-folder-result' });
    return request;
}

async function insertInstallation(
    id: string,
    installationId: number,
    accountId: number,
    login: string,
    selection: 'all' | 'selected'
) {
    const now = new Date();
    await fixture.harness.sql`
        insert into github_installations
            (id, server_id, connection_id, installation_id, account_id, account_login, account_type,
             repository_selection, permissions, events, status, created_at, updated_at, synced_at)
        values (${id}, ${fixture.serverId}, ${fixture.connectionId}, ${installationId},
                ${accountId}, ${login}, ${login === 'ada' ? 'User' : 'Organization'}, ${selection},
                ${{ contents: 'write', metadata: 'read' }}::jsonb, '{}', 'active', ${now}, ${now}, ${now})
    `;
}
