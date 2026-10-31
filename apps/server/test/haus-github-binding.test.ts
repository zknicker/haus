import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    type GithubFixture,
    insertGithubConnection,
    startGithubFixture,
    userId,
} from './github-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';

// Binding authority (specs/github-app-connection.md#binding): Haus Owner or
// Admin on one side, GitHub ownership of the account on the other, App-JWT
// facts, single-use Server-held state, and one Server per installation.

let fixture: GithubFixture;
let member: HausClient;
let outsider: HausClient;
let outsiderServerId: string;
let outsiderConnectionId: string;

const zach = { id: 501, login: 'zach' };
const acme = { id: 900, login: 'acme', type: 'Organization' } as const;

beforeAll(async () => {
    fixture = await startGithubFixture('github_binding');
    const { fake, harness } = fixture;
    fake.users.set('ghu_owner', zach);
    fake.users.set('ghu_outsider', { id: 777, login: 'other' });
    fake.installations.set(4001, { account: acme, id: 4001 });
    fake.installations.set(4002, { account: { ...zach, type: 'User' }, id: 4002 });
    fake.installations.set(4003, {
        account: { id: 901, login: 'bigco', type: 'Organization' },
        id: 4003,
    });
    fake.installations.set(4004, {
        account: { id: 999, login: 'someone', type: 'User' },
        id: 4004,
    });
    fake.memberships.set('ghu_owner:acme', { role: 'admin', state: 'active' });
    fake.memberships.set('ghu_owner:bigco', { role: 'member', state: 'active' });
    fake.memberships.set('ghu_outsider:acme', { role: 'admin', state: 'active' });
    fake.userInstallations.set('ghu_owner', [4001, 4002, 4003, 4004]);
    fake.repositories.set('ghu_owner:4001', [
        { full_name: 'acme/api', id: 7001, private: true },
        { full_name: 'acme/web', id: 7002, private: false },
    ]);
    fake.repositories.set('ghu_owner:4002', []);
    fake.repositories.set('ghu_outsider:4001', []);

    member = createHausClient(
        harness,
        await harness.humans.mintSessionToken('github_binding_member')
    );
    await member.trpc.server.create.mutate({
        displayName: 'Member',
        slug: 'github-binding-member',
    });
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_githubbinding00000001', ${fixture.serverId},
                ${await userId(harness, 'github_binding_member')}, 'member')
    `;
    outsider = createHausClient(
        harness,
        await harness.humans.mintSessionToken('github_binding_out')
    );
    outsiderServerId = (
        await outsider.trpc.server.create.mutate({
            displayName: 'Elsewhere',
            slug: 'github-elsewhere',
        })
    ).id;
    outsiderConnectionId = await insertGithubConnection(
        harness,
        outsiderServerId,
        'ghu_outsider',
        'ghr_outsider'
    );
});

afterAll(async () => {
    member?.close();
    outsider?.close();
    await fixture?.close();
});

const bind = (client: HausClient, githubInstallationId: number) =>
    client.trpc.github.bindInstallation.mutate({
        connectionId: fixture.connectionId,
        githubInstallationId,
        serverId: fixture.serverId,
    });

test('a Server member who is not an Owner or Admin cannot bind or start an install', async () => {
    await expect(bind(member, 4001)).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
        message: expect.stringMatching(/^github_admin_required: /u),
    });
    await expect(
        member.trpc.github.startInstall.mutate({
            connectionId: fixture.connectionId,
            serverId: fixture.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
});

test('seeing an installation is not authority: org members and other users are refused', async () => {
    for (const githubInstallationId of [4003, 4004]) {
        await expect(bind(fixture.owner, githubInstallationId)).rejects.toMatchObject({
            data: { code: 'FORBIDDEN' },
            message: expect.stringMatching(/^github_owner_required: /u),
        });
    }
    expect(await fixture.harness.sql`select id from github_installations`).toEqual([]);
});

test('candidates are the unbound installations the GitHub user owns', async () => {
    const candidates = await fixture.owner.trpc.github.installCandidates.query({
        connectionId: fixture.connectionId,
        serverId: fixture.serverId,
    });
    expect(candidates.map((candidate) => candidate.githubInstallationId).sort()).toEqual([
        4001, 4002,
    ]);
});

test('setup binds once from Server-held state, and a replay or spoof binds nothing', async () => {
    const setup = async (query: string) =>
        await fetch(new URL(`/github/setup?${query}`, fixture.harness.url), { redirect: 'manual' });
    const start = () =>
        fixture.owner.trpc.github.startInstall.mutate({
            connectionId: fixture.connectionId,
            serverId: fixture.serverId,
        });

    const { url } = await start();
    expect(url).toStartWith('https://github.com/apps/haus-test/installations/new?state=');
    const state = new URL(url).searchParams.get('state') ?? '';
    const bound = await setup(`installation_id=4001&setup_action=install&state=${state}`);
    expect(bound.status).toBe(302);
    expect(bound.headers.get('location')).toBe(
        `${fixture.harness.appOrigin}/s/${fixture.slug}/settings/connections/${fixture.connectionId}?github_setup=bound`
    );
    const [row] = await fixture.owner.trpc.github.installations.query({
        connectionId: fixture.connectionId,
        serverId: fixture.serverId,
    });
    expect(row).toMatchObject({
        accessibleRepositoryCount: 2,
        account: acme,
        githubInstallationId: 4001,
        status: 'active',
    });

    const replay = await setup(`installation_id=4001&setup_action=install&state=${state}`);
    expect(replay.status).toBe(400);
    expect((await setup('installation_id=4001&setup_action=install')).status).toBe(400);

    const spoofState = new URL((await start()).url).searchParams.get('state') ?? '';
    const spoofed = await setup(`installation_id=4003&setup_action=install&state=${spoofState}`);
    expect(spoofed.headers.get('location')).toEndWith('?github_setup=github_owner_required');
    expect(
        await fixture.harness.sql`select installation_id from github_installations order by 1`
    ).toEqual([{ installation_id: '4001' }]);
});

test('a Server member who is not an Owner or Admin cannot list repository names', async () => {
    const [installation] = await member.trpc.github.installations.query({
        connectionId: fixture.connectionId,
        serverId: fixture.serverId,
    });
    expect(installation?.githubInstallationId).toBe(4001);
    const query = { installationId: installation?.id ?? '', serverId: fixture.serverId };
    await expect(member.trpc.github.repositories.query(query)).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
        message: expect.stringMatching(/^github_admin_required: /u),
    });
    const names = await fixture.owner.trpc.github.repositories.query(query);
    expect(names.map((repository) => repository.fullName)).toEqual(['acme/api', 'acme/web']);
});

test('an unauthenticated update redirect reconciles an installation once per window', async () => {
    const reconciles = () =>
        fixture.fake.requests.filter((request) => request === 'GET /app/installations/4001').length;
    const before = reconciles();
    const update = () =>
        fetch(
            new URL('/github/setup?setup_action=update&installation_id=4001', fixture.harness.url)
        );
    const answers = await Promise.all([update(), update(), update()]);
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
    expect((await update()).status).toBe(200);
    expect(reconciles() - before).toBe(1);
});

test('an installation bound to another Server answers CONFLICT without naming it', async () => {
    const refused = outsider.trpc.github.bindInstallation.mutate({
        connectionId: outsiderConnectionId,
        githubInstallationId: 4001,
        serverId: outsiderServerId,
    });
    await expect(refused).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    const message = await refused.catch((error: Error) => error.message);
    expect(message).not.toContain(fixture.serverId);
    expect(message).not.toContain(fixture.slug);
});

test('an expired user token refreshes once and the rotated pair is stored', async () => {
    fixture.fake.expired.add('ghu_owner');
    fixture.fake.users.set('ghu_owner_2', zach);
    fixture.fake.refreshes.set('ghr_owner', {
        access_token: 'ghu_owner_2',
        refresh_token: 'ghr_owner_2',
    });
    fixture.fake.repositories.set('ghu_owner_2:4002', [
        { full_name: 'zach/dots', id: 7100, private: false },
    ]);
    const { installation } = await bind(fixture.owner, 4002);
    expect(installation).toMatchObject({
        accessibleRepositoryCount: 1,
        githubInstallationId: 4002,
    });
    const [stored] = (await fixture.harness.sql`
        select secret -> 'tokens' as tokens from mcp_secrets
        where connection_id = ${fixture.connectionId}
    `) as { tokens: Record<string, string> }[];
    expect(stored?.tokens).toMatchObject({
        access_token: 'ghu_owner_2',
        authorization_server: 'https://github.com/login/oauth',
        refresh_token: 'ghr_owner_2',
    });
    expect(
        fixture.fake.requests.filter((request) => request === 'POST /login/oauth/access_token')
    ).toHaveLength(1);
});

test('a rejected refresh asks for sign-in instead of guessing', async () => {
    fixture.fake.expired.add('ghu_owner_2');
    const [installation] = await fixture.owner.trpc.github.installations.query({
        connectionId: fixture.connectionId,
        serverId: fixture.serverId,
    });
    await expect(
        fixture.owner.trpc.github.repositories.query({
            installationId: installation?.id ?? '',
            serverId: fixture.serverId,
        })
    ).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
        message: expect.stringMatching(/^github_sign_in_required: /u),
    });
});
