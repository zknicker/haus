import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// Manual lookup recovery over HTTP: alias get, miss guidance, ranked and empty search.
let harness: HausServerHarness;
let owner: HausClient;
let agentId: string;
let chatId: string;

const computerId = `cmp_${'r'.repeat(16)}`;
const credentialHash = 'd'.repeat(64);

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_manual_rec'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Manual Recovery HQ',
        slug: 'manual-recovery-hq',
    });
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = 'user_manual_rec'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${computerId}, ${server.id}, ${user?.id ?? ''}, ${credentialHash},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Recovery Agent',
        handle: 'recovery-agent',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: server.id,
    });
    agentId = created.agent.id;
    chatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId: server.id })).id;
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('Manual resolves what an Agent typed and answers misses with the closest topics', async () => {
    const runner = await mintRunner('manual_recovery');
    const intent = 'I want to know which model my cloud agents run.';
    const reason = 'A teammate asked whether we can pick the model.';

    const alias = await manualGet(runner.runnerToken, {
        intent,
        reason,
        topic: 'Cloud Agent Model',
    });
    expect(alias.status).toBe(200);
    expect(alias.body.topic.id).toBe('cloud-agents');
    expect(alias.body.topic).not.toHaveProperty('aliases');

    const miss = await manualGet(runner.runnerToken, {
        intent,
        reason,
        topic: 'reminder-schedule-repeat',
    });
    expect(miss.status).toBe(404);
    expect(miss.body.code).toBe('MANUAL_TOPIC_NOT_FOUND');
    expect(miss.body.nextAction).toContain('1. reminder — "Reminders"');

    const ranked = await manualSearch(runner.runnerToken, { intent, q: 'cursor', reason });
    expect(ranked.status).toBe(200);
    expect(ranked.body.results[0].id).toBe('cloud-agents');
    expect(ranked.body.results[0]).not.toHaveProperty('aliases');

    const empty = await manualSearch(runner.runnerToken, { intent, q: 'zzqx', reason });
    expect(empty.status).toBe(404);
    expect(empty.body).toMatchObject({
        code: 'MANUAL_NO_MATCH',
        message: 'No Manual topics matched "zzqx".',
        nextAction: expect.stringContaining('Retry with different keywords'),
    });

    const rows = (await harness.sql`
        select operation, topic_id, query from manual_lookup_audit
        where run_id = 'manual_recovery' order by created_at asc
    `) as Record<string, unknown>[];
    // Misses are recorded as typed, so miss review can replay them.
    const lookups = ['Cloud Agent Model', 'reminder-schedule-repeat', 'cursor', 'zzqx'];
    expect(rows.map((row) => row.topic_id ?? row.query)).toEqual(lookups);
});

async function mintRunner(runId: string) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ agentId, chatId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { runnerId: string; runnerToken: string };
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
