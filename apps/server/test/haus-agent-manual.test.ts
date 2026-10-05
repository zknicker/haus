import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let agentId: string;
let chatId: string;
let ownerUserId: string;

const computerId = `cmp_${'m'.repeat(16)}`;
const credentialHash = 'b'.repeat(64);
const otherComputerId = `cmp_${'n'.repeat(16)}`;
const otherCredentialHash = 'c'.repeat(64);

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_manual_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Manual HQ',
        slug: 'manual-hq',
    });
    serverId = server.id;
    ownerUserId = await readUserId('user_manual_owner');
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${computerId}, ${serverId}, ${ownerUserId}, ${credentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Manual Agent',
        handle: 'manual-agent',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    chatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('an authenticated runner can get and search Manual topics with safe audit metadata', async () => {
    const runner = await mintRunner('manual_read');
    const intent = 'I need the operating procedure before I start work.';
    const reason = 'The requested change needs a safe, auditable task path.';

    const get = await manualGet(runner.runnerToken, {
        intent,
        reason,
        topic: 'recipes/technique/task-claim-lock',
    });
    expect(get.status).toBe(200);
    expect(get.body.topic).toMatchObject({
        class: 'technique',
        evidence: 'verified',
        id: 'recipes/technique/task-claim-lock',
        kind: 'recipe',
        tier: 'seeded',
    });
    expect(get.body.topic.triggers).toContain('should I claim this before starting');
    expect(get.body.topic.body).toContain('The task claim is the concurrency lock.');

    const search = await manualSearch(runner.runnerToken, {
        intent,
        limit: '1',
        q: 'claim task',
        reason,
        scope: 'recipes',
    });
    expect(search.status).toBe(200);
    expect(search.body.results).toHaveLength(1);
    expect(search.body.results[0]).toMatchObject({
        class: 'technique',
        id: 'recipes/technique/task-claim-lock',
        kind: 'recipe',
        tier: 'seeded',
    });
    expect(search.body.results[0].triggers).toContain('two agents might work on the same request');
    expect(search.body.results[0]).not.toHaveProperty('body');

    const rows = (await harness.sql`
        select agent_id, server_id, operation, topic_id, query, intent, reason, runner_id, run_id,
            created_at
        from manual_lookup_audit
        where server_id = ${serverId} and agent_id = ${agentId}
        order by created_at asc
    `) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
        agent_id: agentId,
        intent,
        operation: 'get',
        reason,
        runner_id: runner.runnerId,
        run_id: 'manual_read',
        server_id: serverId,
        topic_id: 'recipes/technique/task-claim-lock',
    });
    expect(rows[1]).toMatchObject({
        agent_id: agentId,
        intent,
        operation: 'search',
        query: 'claim task',
        reason,
        runner_id: runner.runnerId,
        run_id: 'manual_read',
        server_id: serverId,
    });
    expect(Object.keys(rows[0] ?? {})).not.toContain('body');
    expect(Object.keys(rows[0] ?? {})).not.toContain('message_payload');
});

test('Manual rejects invalid metadata and suggests the index for an unknown topic', async () => {
    const runner = await mintRunner('manual_errors');
    const missingToken = await fetch(
        `${harness.url}/api/agent/manual/get?topic=index&intent=read%20the%20guide&reason=choose%20the%20next%20step`
    );
    expect(missingToken.status).toBe(401);

    const invalid = await manualGet(runner.runnerToken, {
        intent: 'too short',
        reason: 'also short',
        topic: 'index',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('MANUAL_INVALID_METADATA');

    const unknown = await manualGet(runner.runnerToken, {
        intent: 'I need a topic that does not exist yet.',
        reason: 'I am testing the documented recovery path.',
        topic: 'recipes/no-such-topic',
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toMatchObject({
        code: 'MANUAL_TOPIC_NOT_FOUND',
        nextAction: expect.stringContaining('haus manual get index'),
    });
});

test('Manual fails closed when a runner lacks the Manual capability', async () => {
    const runner = await mintRunner('manual_denied');
    await harness.sql`
        update agent_runner_credentials set capabilities = '{}'::text[] where id = ${runner.runnerId}
    `;
    const response = await manualGet(runner.runnerToken, {
        intent: 'I need to read the operating overview.',
        reason: 'The Agent must verify its available capabilities.',
        topic: 'index',
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('MANUAL_CAPABILITY_REQUIRED');
});

test('runner credentials cannot cross Server boundaries', async () => {
    const other = await createOtherServer();
    const rejected = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({
            agentId: other.agentId,
            chatId: other.chatId,
            credentialHash,
            runId: 'manual_cross_server',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(rejected.status).toBe(403);

    const runner = await mintRunnerFor(
        {
            agentId: other.agentId,
            chatId: other.chatId,
            credentialHash: otherCredentialHash,
        },
        'manual_other'
    );
    const response = await manualGet(runner.runnerToken, {
        intent: 'I need the overview from this Server.',
        reason: 'The runner must remain scoped to its own Server.',
        topic: 'index',
    });
    expect(response.status).toBe(200);

    const rows = (await harness.sql`
        select agent_id, server_id, run_id
        from manual_lookup_audit
        where server_id = ${other.serverId}
    `) as Record<string, unknown>[];
    expect(rows).toEqual([
        { agent_id: other.agentId, run_id: 'manual_other', server_id: other.serverId },
    ]);
});

async function mintRunner(runId: string) {
    return mintRunnerFor({ agentId, chatId, credentialHash }, runId);
}

async function mintRunnerFor(
    input: { agentId: string; chatId: string; credentialHash: string },
    runId: string
) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ ...input, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { runnerId: string; runnerToken: string };
}

async function createOtherServer() {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Manual Other HQ',
        slug: 'manual-other-hq',
    });
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${otherComputerId}, ${server.id}, ${ownerUserId}, ${otherCredentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId: otherComputerId,
        displayName: 'Other Manual Agent',
        handle: 'other-manual-agent',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: server.id,
    });
    const chat = await owner.trpc.chat.ensureAgentDm.mutate({
        agentId: created.agent.id,
        serverId: server.id,
    });
    return { agentId: created.agent.id, chatId: chat.id, serverId: server.id };
}

const manualGet = (token: string, query: Record<string, string>) =>
    manualRequest('get', token, query);
const manualSearch = (token: string, query: Record<string, string>) =>
    manualRequest('search', token, query);

async function manualRequest(
    operation: 'get' | 'search',
    token: string,
    query: Record<string, string>
) {
    const url = new URL(`/api/agent/manual/${operation}`, harness.url);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    return { body: (await response.json()) as Record<string, any>, status: response.status };
}

async function signIn(clerkUserId: string) {
    const token = await harness.clerk.mintSessionToken(clerkUserId);
    return createHausClient(harness, token);
}

async function readUserId(clerkUserId: string) {
    const rows = (await harness.sql`
        select id from users where clerk_user_id = ${clerkUserId}
    `) as { id: string }[];
    return rows[0]?.id ?? '';
}
