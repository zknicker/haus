import { afterAll, beforeAll, expect, test } from 'bun:test';
import { computerGitCredentialPath, computerGitIdentityPath } from '@haus/api';
import { hashComputerSecret } from '../src/computers/service.ts';
import { fakeBotUserId } from './github-fake.ts';
import { type GithubFixture, startGithubFixture } from './github-fixture.ts';

const secret = 'computer-git-secret';
const installationId = 5150;
let fixture: GithubFixture;
let computerId: string;

beforeAll(async () => {
    fixture = await startGithubFixture('git_credential');
    const [home] = (await fixture.harness.sql`
        select computer_id from agents where id = ${fixture.agentId}
    `) as { computer_id: string }[];
    computerId = home?.computer_id ?? '';
    await fixture.harness.sql`
        update computers set credential_hash = ${hashComputerSecret(secret)} where id = ${computerId}
    `;
    fixture.fake.installations.set(installationId, {
        account: { id: 77, login: 'Acme', type: 'Organization' },
        id: installationId,
    });
    fixture.fake.installationRepositories.set(installationId, ['widgets', 'gadgets']);
    const now = new Date();
    await fixture.harness.sql`
        insert into github_installations
            (id, server_id, connection_id, installation_id, account_id, account_login, account_type,
             repository_selection, permissions, events, status, created_at, updated_at, synced_at)
        values ('ghi_gitcredential001', ${fixture.serverId}, ${fixture.connectionId}, ${installationId},
                77, 'Acme', 'Organization', 'selected', ${{ contents: 'write', metadata: 'read' }}::jsonb,
                '{}', 'active', ${now}, ${now}, ${now})
    `;
    for (const repository of ['acme/widgets', 'acme/private-elsewhere', 'stranger/tools']) {
        await fixture.harness.sql`
            insert into repos (server_id, repository) values (${fixture.serverId}, ${repository})
        `;
        await fixture.harness.sql`
            insert into repo_folders (server_id, computer_id, repository, path)
            values (${fixture.serverId}, ${computerId}, ${repository}, ${`/Users/ada/src/${repository}`})
        `;
    }
    await fixture.harness.sql`
        insert into repos (server_id, repository) values (${fixture.serverId}, 'acme/gadgets')
    `;
    await insertInvocation('inv_gitcredopen00000', 'sent');
    await insertInvocation('inv_gitcreddone00000', 'finished');
});

afterAll(async () => {
    await fixture?.close();
});

test('an open Agent command gets a token scoped to one repo with contents write', async () => {
    const response = await requestCredential({
        access: 'write',
        invocationId: 'inv_gitcredopen00000',
        repository: 'Acme/Widgets',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ token: 'ghs_fake1' });
    expect(fixture.fake.mints.at(-1)).toEqual({
        body: { permissions: { contents: 'write' }, repositories: ['widgets'] },
        installationId,
        token: 'ghs_fake1',
    });
});

test('a cleanup fetch gets a read token, even for an Agent without the GitHub connection', async () => {
    await fixture.harness.sql`
        delete from agent_mcp_connection_grants where agent_id = ${fixture.agentId}
    `;
    const write = await requestCredential({
        access: 'write',
        invocationId: 'inv_gitcredopen00000',
        repository: 'acme/widgets',
    });
    const read = await requestCredential({
        access: 'read',
        agentId: fixture.agentId,
        repository: 'acme/widgets',
    });
    await fixture.harness.sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${fixture.serverId}, ${fixture.agentId}, ${fixture.connectionId})
    `;

    expect(write.status).toBe(403);
    expect(await write.json()).toMatchObject({ code: 'github_connection_not_granted' });
    expect(read.status).toBe(200);
    expect(fixture.fake.mints.at(-1)?.body).toEqual({
        permissions: { contents: 'read' },
        repositories: ['widgets'],
    });
});

test('the App without access to a repo is refused by name', async () => {
    const unselected = await requestCredential({
        access: 'write',
        invocationId: 'inv_gitcredopen00000',
        repository: 'acme/private-elsewhere',
    });
    const uninstalled = await requestCredential({
        access: 'write',
        invocationId: 'inv_gitcredopen00000',
        repository: 'stranger/tools',
    });

    expect(await unselected.json()).toEqual({
        code: 'github_app_needs_access',
        error: 'The Haus GitHub App needs access to acme/private-elsewhere. Ask an Owner or Admin to install it on acme with access to acme/private-elsewhere.',
    });
    expect(uninstalled.status).toBe(403);
    expect(await uninstalled.json()).toMatchObject({ code: 'github_app_needs_access' });
});

test('a settled command, a repo with no folder here, or a bad credential gets nothing', async () => {
    const settled = await requestCredential({
        access: 'write',
        invocationId: 'inv_gitcreddone00000',
        repository: 'acme/widgets',
    });
    const noFolder = await requestCredential({
        access: 'write',
        invocationId: 'inv_gitcredopen00000',
        repository: 'acme/gadgets',
    });
    const stranger = await requestCredential(
        { access: 'read', agentId: fixture.agentId, repository: 'acme/widgets' },
        'not-the-secret'
    );

    expect(await settled.json()).toMatchObject({ code: 'invocation_not_open' });
    expect(await noFolder.json()).toMatchObject({ code: 'repo_folder_missing' });
    expect(stranger.status).toBe(401);
});

test('the bot identity is the App slug with its noreply address', async () => {
    const response = await fetch(new URL(computerGitIdentityPath, fixture.harness.url), {
        headers: { authorization: `Bearer ${secret}` },
    });

    expect(await response.json()).toEqual({
        email: `${fakeBotUserId}+haus-test[bot]@users.noreply.github.com`,
        name: 'haus-test[bot]',
    });
});

function requestCredential(body: object, credential = secret) {
    return fetch(new URL(computerGitCredentialPath, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
        method: 'POST',
    });
}

async function insertInvocation(id: string, state: 'finished' | 'sent') {
    const finished = state === 'finished';
    await fixture.harness.sql`
        insert into agent_invocations
            (id, server_id, agent_id, computer_id, run_id, tool_call_id, seq, operation_kind,
             state, timeout_ms, requested_at, outcome, finished_at)
        values (${id}, ${fixture.serverId}, ${fixture.agentId}, ${computerId}, ${`run_${id.slice(4)}`},
                ${`toolu_${id.slice(4)}`}, 0, 'bash', ${state}, 120000, now(),
                ${finished ? 'completed' : null}, ${finished ? new Date() : null})
    `;
}
