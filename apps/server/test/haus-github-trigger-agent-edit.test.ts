import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { agentTriggerResultSchema, githubTriggerPreviewResultSchema } from '@haus/api';
import { fixtureRepository, workflowRunPayload } from './github-delivery-fixtures.ts';
import { createFakeGithub, type FakeGithub } from './github-fake.ts';
import {
    type GithubTriggerWorld,
    postGithubDelivery,
    seedGithubTriggerWorld,
} from './github-trigger-seed.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let github: FakeGithub;
let world: GithubTriggerWorld;
let token: string;
let id: string;
beforeAll(async () => {
    github = await createFakeGithub();
    harness = await startHausServerHarness({ githubApp: github.app });
    world = await seedGithubTriggerWorld(harness, 'github-agent-edit');
    const minted = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId: world.agentId,
            chatId: world.channelId,
            credentialHash: 'b'.repeat(64),
            runId: 'run_github_edit',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    token = ((await minted.json()) as { runnerToken: string }).runnerToken;
    const created = await request('POST', '/api/agent/triggers', {
        messageId: world.anchorMessageId,
        title: 'CI',
        kind: 'github',
        github: {
            events: [{ event: 'workflow_run' }],
            installationId: world.installationRowId,
            repositories: { scope: 'installation' },
        },
    });
    expect(created.status).toBe(200);
    id = agentTriggerResultSchema.parse(await created.json()).trigger.id;
});
afterAll(async () => {
    world?.owner.close();
    await harness?.close();
});

test('agent edits preserve the anchor and replace all match groups', async () => {
    const original = agentTriggerResultSchema.parse(
        await (await request('GET', `/api/agent/triggers/${id}`)).json()
    ).trigger;
    const response = await request('PATCH', `/api/agent/triggers/${id}`, {
        title: 'Deploy or CI failed',
        github: {
            installationId: world.installationRowId,
            repositories: { scope: 'installation' },
            events: [
                {
                    event: 'workflow_run',
                    workflows: ['.github/workflows/deploy.yml'],
                    conclusions: ['failure', 'cancelled'],
                },
                {
                    event: 'workflow_run',
                    workflows: ['.github/workflows/ci.yml'],
                    conclusions: ['failure'],
                    repositoriesIgnore: ['acme/archive-*'],
                },
            ],
        },
    });
    expect(response.status).toBe(200);
    const updated = agentTriggerResultSchema.parse(await response.json()).trigger;
    expect(updated).toMatchObject({
        anchorChatId: original.anchorChatId,
        anchorMessageId: original.anchorMessageId,
        ownerAgentId: original.ownerAgentId,
        id,
        version: original.version + 1,
        title: 'Deploy or CI failed',
    });
    expect(updated.kind === 'github' && updated.github.events).toHaveLength(2);
    expect((await request('PATCH', `/api/agent/triggers/${id}`, {})).status).toBe(400);
});

test('agent and operator previews share selection without recording fires', async () => {
    const payload = workflowRunPayload();
    const response = await request('POST', `/api/agent/triggers/${id}/preview`, {
        event: 'workflow_run',
        payload,
    });
    expect(response.status).toBe(200);
    const result = githubTriggerPreviewResultSchema.parse(await response.json());
    expect(result).toEqual({
        groups: [
            { index: 0, matches: false },
            { index: 1, matches: true },
        ],
        matches: true,
        repositoryInScope: true,
    });
    expect(
        await world.owner.trpc.trigger.preview.query({
            serverId: world.serverId,
            triggerId: id,
            event: 'workflow_run',
            payload,
        })
    ).toEqual(result);
    const outside = await request('POST', `/api/agent/triggers/${id}/preview`, {
        event: 'workflow_run',
        payload: { ...payload, repository: { ...fixtureRepository, id: 99_999 } },
    });
    expect(githubTriggerPreviewResultSchema.parse(await outside.json())).toMatchObject({
        matches: false,
        repositoryInScope: false,
    });
    const fires = await world.owner.trpc.trigger.runs.query({
        serverId: world.serverId,
        triggerId: id,
    });
    expect(fires).toEqual([]);
});

test('overlapping groups produce one durable fire and one delivery', async () => {
    const updated = await request('PATCH', `/api/agent/triggers/${id}`, {
        github: {
            installationId: world.installationRowId,
            repositories: { scope: 'installation' },
            events: [
                { event: 'workflow_run', conclusions: ['failure'] },
                { event: 'workflow_run', workflows: ['**/ci.yml'] },
            ],
        },
    });
    expect(updated.status).toBe(200);
    const guid = randomUUID();
    const delivered = await postGithubDelivery(harness, {
        event: 'workflow_run',
        guid,
        payload: workflowRunPayload(),
        secret: github.app.config.webhookSecret,
    });
    expect(delivered.status).toBe(202);
    const rows =
        await harness.sql`select f.id, i.id as inbox_id from trigger_fires f join agent_inbox i on i.dedupe_key = f.id and i.server_id=f.server_id where f.trigger_id = ${id} and f.dedupe_key = ${`gh:${guid}`}`;
    expect(rows).toHaveLength(1);
});

test('revoked GitHub access refuses edits instead of broadening scope', async () => {
    await harness.sql`delete from agent_mcp_connection_grants where server_id = ${world.serverId} and agent_id = ${world.agentId} and connection_id = ${world.connectionId}`;
    const response = await request('PATCH', `/api/agent/triggers/${id}`, {
        github: {
            installationId: world.installationRowId,
            repositories: { scope: 'installation' },
            events: [{ event: 'workflow_run' }],
        },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
        code: 'INVALID_ARG',
        message: expect.stringContaining('github_access_required'),
    });
});

test('another Agent cannot edit or preview the owned trigger', async () => {
    const peer = await world.owner.trpc.agent.create.mutate({
        computerId: 'cmp_githubtriggers01',
        displayName: 'Peer',
        handle: 'peer',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: world.serverId,
    });
    await harness.sql`insert into channel_agent_participants (server_id, chat_id, agent_id) values (${world.serverId}, ${world.channelId}, ${peer.agent.id}) on conflict do nothing`;
    const minted = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId: peer.agent.id,
            chatId: world.channelId,
            credentialHash: 'b'.repeat(64),
            runId: 'run_github_peer',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    const peerToken = ((await minted.json()) as { runnerToken: string }).runnerToken;
    for (const [method, path, body] of [
        ['PATCH', `/api/agent/triggers/${id}`, { title: 'Foreign' }],
        ['POST', `/api/agent/triggers/${id}/preview`, { event: 'workflow_run', payload: {} }],
    ] as const) {
        const response = await fetch(new URL(path, harness.url), {
            method,
            body: JSON.stringify(body),
            headers: { authorization: `Bearer ${peerToken}`, 'content-type': 'application/json' },
        });
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: 'INVALID_TARGET' });
    }
});

function request(method: string, path: string, body?: unknown) {
    return fetch(new URL(path, harness.url), {
        method,
        headers: {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}
