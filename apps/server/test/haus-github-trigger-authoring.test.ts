import { afterAll, beforeAll, expect, test } from 'bun:test';
import { githubTriggerInstallationCap } from '@haus/api';
import { fixtureInstallationId } from './github-delivery-fixtures.ts';
import { createFakeGithub, type FakeGithub } from './github-fake.ts';
import {
    type GithubTriggerWorld,
    insertGithubTrigger,
    seedGithubTriggerWorld,
} from './github-trigger-seed.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// Creating and editing `github` Triggers through the operator and Agent paths:
// each authoring check refuses with a code that names the fix, and the cap
// holds at twenty-five per installation.

const userToken = 'ghu_authoring';
const workflowFailures = [{ conclusions: ['failure'], event: 'workflow_run' }] as const;

let github: FakeGithub;
let harness: HausServerHarness;
let world: GithubTriggerWorld;

beforeAll(async () => {
    github = await createFakeGithub();
    harness = await startHausServerHarness({ githubApp: github.app });
    world = await seedGithubTriggerWorld(harness, 'github-authoring');
    github.users.set(userToken, { id: 501, login: 'octocat' });
    github.repositories.set(`${userToken}:${fixtureInstallationId}`, [
        { full_name: 'acme/api', id: 7001, private: true },
        { full_name: 'acme/web', id: 7002, private: false },
        { full_name: 'acme/infra', id: 7003, private: true },
    ]);
    await harness.sql`
        insert into mcp_secrets (connection_id, secret)
        values (${world.connectionId}, ${{ tokens: { access_token: userToken, token_type: 'bearer' } }}::jsonb)
    `;
});

afterAll(async () => {
    world?.owner.close();
    await harness?.close();
});

function create(github: unknown, title = 'CI failed') {
    return world.owner.trpc.trigger.create.mutate({
        agentId: world.agentId,
        github: github as never,
        kind: 'github',
        serverId: world.serverId,
        title,
    });
}

test('an operator creates a github Trigger with selected repositories and no secret', async () => {
    const created = await create({
        events: workflowFailures,
        installationId: world.installationRowId,
        repositories: { names: ['ACME/API'], scope: 'repositories' },
    });
    expect(created).not.toHaveProperty('secret');
    expect(created.trigger).toMatchObject({
        github: {
            events: [{ actions: ['completed'], conclusions: ['failure'], event: 'workflow_run' }],
            installationId: world.installationRowId,
            installationLogin: 'acme',
            problem: null,
            repositories: { names: ['acme/api'], scope: 'repositories' },
            suppressedCount: 0,
        },
        kind: 'github',
        status: 'armed',
    });
    const [config] = await harness.sql`
        select array_to_string(repository_ids, ',') as ids
        from github_trigger_configs where trigger_id = ${created.trigger.id}
    `;
    expect(config).toEqual({ ids: '7001' });
});

test('an Agent creates a github Trigger anchored on the asking message', async () => {
    const minted = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId: world.agentId,
            chatId: world.channelId,
            credentialHash: 'b'.repeat(64),
            runId: 'run_github_authoring',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const { runnerToken } = (await minted.json()) as { runnerToken: string };
    const response = await fetch(new URL('/api/agent/triggers', harness.url), {
        body: JSON.stringify({
            github: {
                events: [{ conclusions: ['failure'], event: 'workflow_run' }],
                installationId: world.installationRowId,
                repositories: { scope: 'installation' },
            },
            kind: 'github',
            messageId: world.anchorMessageId,
            title: 'CI failed',
        }),
        headers: { authorization: `Bearer ${runnerToken}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('secret');
    expect(body.trigger).toMatchObject({
        anchorMessageId: world.anchorMessageId,
        anchorTarget: '#all',
        createdByUserId: null,
        github: { repositories: { scope: 'installation' } },
        kind: 'github',
    });
});

test('each authoring check refuses with a code that names the fix', async () => {
    const base = { events: workflowFailures, installationId: world.installationRowId };
    await expect(
        create({ ...base, repositories: { names: ['acme/infra'], scope: 'repositories' } })
    ).rejects.toMatchObject({
        message: expect.stringMatching(/^github_repositories_unavailable: /u),
    });
    await expect(
        create({ ...base, repositories: { names: ['acme/elsewhere'], scope: 'repositories' } })
    ).rejects.toMatchObject({
        message: expect.stringMatching(/^github_repositories_unavailable: /u),
    });
    await expect(
        create({
            events: [{ event: 'workflow_job' }, { event: 'deployment_status' }],
            installationId: world.installationRowId,
            repositories: { scope: 'installation' },
        })
    ).resolves.toBeDefined();
    await harness.sql`
        update github_installations set permissions = ${{ actions: 'write', metadata: 'read' }}::jsonb
        where id = ${world.installationRowId}
    `;
    await expect(
        create({ ...base, events: [{ event: 'issues' }], repositories: { scope: 'installation' } })
    ).rejects.toMatchObject({ message: expect.stringMatching(/^github_permissions_missing: /u) });
    await harness.sql`
        update github_installations
        set permissions = ${{ actions: 'write', contents: 'write', deployments: 'read', issues: 'write', metadata: 'read' }}::jsonb
        where id = ${world.installationRowId}
    `;
    await expect(
        create({
            ...base,
            installationId: 'ghi_doesnotexist01',
            repositories: { scope: 'installation' },
        })
    ).rejects.toMatchObject({
        message: expect.stringMatching(/^github_installation_unavailable: /u),
    });

    await harness.sql`
        delete from agent_mcp_connection_grants where agent_id = ${world.agentId}
    `;
    await expect(
        create({ ...base, repositories: { scope: 'installation' } })
    ).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
        message: expect.stringMatching(/^github_access_required: /u),
    });
    await harness.sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${world.serverId}, ${world.agentId}, ${world.connectionId})
    `;
});

test('the twenty-sixth github Trigger on an installation is refused', async () => {
    const [row] = (await harness.sql`
        select count(*)::int as total from github_trigger_configs c join triggers t on t.id = c.trigger_id
        where c.installation_row_id = ${world.installationRowId} and t.deleted_at is null
    `) as { total: number }[];
    for (let index = row?.total ?? 0; index < githubTriggerInstallationCap - 1; index += 1) {
        await insertGithubTrigger(harness, world, { events: workflowFailures });
    }
    const config = {
        events: workflowFailures,
        installationId: world.installationRowId,
        repositories: { scope: 'installation' },
    };
    const last = await create(config, 'Twenty-fifth');
    await expect(create(config, 'Twenty-sixth')).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
        message: expect.stringMatching(/^github_trigger_limit: /u),
    });
    // Editing a Trigger already under the cap is not a new Trigger.
    const edited = await world.owner.trpc.trigger.update.mutate({
        github: { ...config, events: [{ event: 'push' }] } as never,
        serverId: world.serverId,
        triggerId: last.trigger.id,
    });
    expect(edited.trigger).toMatchObject({ github: { events: [{ event: 'push' }] }, version: 2 });
    await world.owner.trpc.trigger.delete.mutate({
        serverId: world.serverId,
        triggerId: last.trigger.id,
    });
    await expect(create(config, 'Room again')).resolves.toMatchObject({
        trigger: { kind: 'github' },
    });
});

test('an update clears a standing problem, and a webhook has no GitHub configuration', async () => {
    await harness.sql`
        update triggers set deleted_at = now(), status = 'disabled'
        where kind = 'github' and server_id = ${world.serverId}
    `;
    const triggerId = await insertGithubTrigger(harness, world, { events: workflowFailures });
    await harness.sql`
        update github_trigger_configs set problem = 'permissions_missing', problem_since = now()
        where trigger_id = ${triggerId}
    `;
    const updated = await world.owner.trpc.trigger.update.mutate({
        github: {
            events: [{ event: 'push' }],
            installationId: world.installationRowId,
            repositories: { scope: 'installation' },
        },
        serverId: world.serverId,
        title: 'Pushes',
        triggerId,
    });
    expect(updated.trigger).toMatchObject({
        github: { problem: null, problemSince: null },
        title: 'Pushes',
    });

    const webhook = await world.owner.trpc.trigger.create.mutate({
        agentId: world.agentId,
        kind: 'webhook',
        serverId: world.serverId,
        title: 'Deploys',
    });
    await expect(
        world.owner.trpc.trigger.update.mutate({
            github: {
                events: [{ event: 'push' }],
                installationId: world.installationRowId,
                repositories: { scope: 'installation' },
            },
            serverId: world.serverId,
            triggerId: webhook.trigger.id,
        })
    ).rejects.toMatchObject({ message: expect.stringMatching(/^trigger_kind_mismatch: /u) });
});
