import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// The GitHub seam before GitHub deliveries land: a stored `github` Trigger
// reads as the `github` wire variant, and every path that would author or
// rotate one refuses with a stable code instead of half-working.

let anchorMessageId: string;
let agentId: string;
let channelId: string;
let githubTriggerId: string;
let harness: HausServerHarness;
let owner: HausClient;
let runnerToken: string;
let serverId: string;

const computerId = 'cmp_githubseamhost01';
const credentialHash = 'a'.repeat(64);
const connectionId = 'mcp_githubseam000001';
const installationRowId = 'ghi_githubseam000001';
const codexRuntime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };
const config = {
    events: [{ event: 'workflow_run' }],
    installationId: installationRowId,
    repositories: { scope: 'installation' },
} as const;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_github_seam'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'GitHub Seam',
        slug: 'github-seam',
    });
    serverId = server.id;
    channelId = server.channels[0].id;
    const [user] = (await harness.sql`
        select id from users where auth_subject = 'user_github_seam'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (${computerId}, ${serverId}, ${user.id}, ${credentialHash}, ${{ runtimes: [codexRuntime] }}::jsonb, 'healthy')
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Sage',
        handle: 'sage',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
        on conflict do nothing
    `;
    const sent = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Tell me when CI fails',
        nonce: 'github_seam_anchor',
        serverId,
    });
    anchorMessageId = sent.message.id;
    runnerToken = await mintRunner('run_github_seam');
    githubTriggerId = await insertGithubTrigger(user.id);
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('a stored github Trigger reads as the github variant with no URL', async () => {
    const [listed] = await owner.trpc.trigger.list.query({ agentId, serverId });

    expect(listed).toEqual({
        anchorChatId: channelId,
        anchorMessageId,
        createdAt: '2026-10-11T12:00:00.000Z',
        createdByHandle: null,
        createdByUserId: null,
        disabledAt: null,
        fireCount: 0,
        github: {
            events: [{ actions: ['completed'], conclusions: ['failure'], event: 'workflow_run' }],
            installationId: installationRowId,
            installationLogin: 'acme',
            problem: 'sign_in_required',
            problemSince: '2026-10-11T13:00:00.000Z',
            repositories: { names: ['acme/api'], scope: 'repositories' },
            suppressedCount: 2,
        },
        id: githubTriggerId,
        instruction: null,
        kind: 'github',
        lastFiredAt: null,
        ownerAgentId: agentId,
        ownerHandle: 'sage',
        status: 'armed',
        title: 'CI failed',
        updatedAt: '2026-10-11T12:00:00.000Z',
        version: 1,
    });

    const shown = await agentRequest('GET', `/api/agent/triggers/${githubTriggerId}`);
    expect(shown.status).toBe(200);
    expect(shown.body.trigger).toMatchObject({ anchorTarget: '#all', kind: 'github' });
    expect(shown.body.trigger).not.toHaveProperty('url');
});

test('authoring a github Trigger checks the installation and names the fix', async () => {
    // The seeded installation has never synced its access cache.
    await expect(
        owner.trpc.trigger.create.mutate({
            agentId,
            github: config,
            kind: 'github',
            serverId,
            title: 'CI failed',
        })
    ).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
        message: expect.stringMatching(/^github_access_required: /u),
    });
    await expect(
        owner.trpc.trigger.update.mutate({ github: config, serverId, triggerId: githubTriggerId })
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });

    const { installationId: _installationId, ...agentConfig } = config;
    const refused = await agentRequest('POST', '/api/agent/triggers', {
        github: { ...agentConfig, account: 'acme' },
        kind: 'github',
        messageId: anchorMessageId,
        title: 'CI failed',
    });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ code: 'INVALID_ARG' });
    expect(String(refused.body.message)).toStartWith('github_access_required: ');
    expect(await harness.sql`select id from triggers where kind = 'github'`).toEqual([
        { id: githubTriggerId },
    ]);
});

test('a github Trigger has no secret to rotate', async () => {
    await expect(
        owner.trpc.trigger.rotate.mutate({ serverId, triggerId: githubTriggerId })
    ).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
        message: expect.stringMatching(/^trigger_has_no_secret: /u),
    });
    const refused = await agentRequest('POST', `/api/agent/triggers/${githubTriggerId}/rotate`);
    expect(refused).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
    const [row] = (await harness.sql`
        select secret_hash, version from triggers where id = ${githubTriggerId}
    `) as { secret_hash: string | null; version: number }[];
    expect(row).toEqual({ secret_hash: null, version: 1 });
});

test('a github test fire carries a sample projection marked test', async () => {
    const { fireId } = await owner.trpc.trigger.test.mutate({
        serverId,
        triggerId: githubTriggerId,
    });
    const [fire] = (await harness.sql`
        select payload from trigger_fires where id = ${fireId}
    `) as { payload: string }[];
    expect(JSON.parse(fire?.payload ?? '{}')).toMatchObject({
        event: 'workflow_run',
        installation: { account: 'acme' },
        repository: { full_name: 'acme/api' },
        test: true,
        workflow_run: { conclusion: 'failure' },
    });
    const [inbox] = (await harness.sql`
        select content from agent_inbox where dedupe_key = ${fireId}
    `) as { content: string }[];
    expect(inbox?.content).toContain(
        'GitHub: workflow_run completed · failure · main · acme/api #0'
    );
    expect(inbox?.content).toContain('github-event=workflow_run.completed; delivery=test');
});

test('without App credentials the webhook answers 503 and the sink still 204', async () => {
    const webhook = await fetch(new URL('/api/github/webhook', harness.url), {
        body: '{}',
        headers: {
            'content-type': 'application/json',
            'x-github-delivery': 'guid',
            'x-github-event': 'ping',
            'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
        },
        method: 'POST',
    });
    expect(webhook.status).toBe(503);
    expect(await webhook.json()).toEqual({ code: 'github_app_unconfigured' });
    const sink = await fetch(new URL('/api/github/sink', harness.url), { method: 'POST' });
    expect(sink.status).toBe(204);
});

async function insertGithubTrigger(userId: string) {
    const triggerId = 'trg_githubseam00001';
    const createdAt = new Date('2026-10-11T12:00:00.000Z');
    await harness.sql`
        insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools, preset)
        values (${connectionId}, ${serverId}, 'GitHub', 'https://api.githubcopilot.com/mcp/',
                'oauth', true, '{}', '{}', 'github')
    `;
    await harness.sql`
        insert into github_installations
            (id, server_id, connection_id, installation_id, account_id, account_login, account_type,
             repository_selection, permissions, events, status, accessible_repository_ids,
             bound_by_user_id, created_at, updated_at, synced_at)
        values (${installationRowId}, ${serverId}, ${connectionId}, 4242, 99, 'acme', 'Organization',
                'selected', ${{ actions: 'write', metadata: 'read' }}::jsonb, '{workflow_run}', 'active',
                '{7001,7002}', ${userId}, ${createdAt}, ${createdAt}, ${createdAt})
    `;
    await harness.sql`
        insert into triggers
            (id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, kind, secret_hash,
             status, title, created_at, updated_at)
        values (${triggerId}, ${serverId}, ${agentId}, ${channelId}, ${anchorMessageId}, 'github', null,
                'armed', 'CI failed', ${createdAt}, ${createdAt})
    `;
    await harness.sql`
        insert into github_trigger_configs
            (trigger_id, server_id, installation_row_id, repository_scope, repository_ids,
             repository_names, events, problem, problem_since, suppressed_count)
        values (${triggerId}, ${serverId}, ${installationRowId}, 'repositories', '{7001}',
                '{acme/api}',
                ${[{ actions: ['completed'], conclusions: ['failure'], event: 'workflow_run' }]}::jsonb,
                'sign_in_required', ${new Date('2026-10-11T13:00:00.000Z')}, 2)
    `;
    return triggerId;
}

async function agentRequest(method: 'GET' | 'POST', path: string, body?: unknown) {
    const response = await fetch(new URL(path, harness.url), {
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: {
            authorization: `Bearer ${runnerToken}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method,
    });
    return {
        body: (await response.json()) as {
            code?: string;
            message?: string;
            trigger?: Record<string, unknown>;
        },
        status: response.status,
    };
}

async function mintRunner(runId: string) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ agentId, chatId: channelId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`mint failed: ${response.status}`);
    }
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}
