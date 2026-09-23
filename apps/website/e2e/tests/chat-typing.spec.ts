import { assertOpaqueId, createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const computerId = 'cmp_chattyping000000';
const credentialHash = 'e'.repeat(64);
const runId = 'run_e2e_chat_typing';

test('an Agent reading a message types until its reply lands', async ({ page }) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Chat typing',
        slug: 'chat-typing',
    });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
    assertOpaqueId(chatId);
    const ownerUserId = runPsql(
        session.databaseUrl,
        "select id from users where clerk_user_id = 'user_e2e_human'"
    );
    assertOpaqueId(ownerUserId);
    const inventory = {
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    };
    runPsql(
        session.databaseUrl,
        `insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
         values ('${computerId}', '${server.id}', '${ownerUserId}', '${credentialHash}', '${JSON.stringify(inventory)}'::jsonb, 'healthy')`
    );
    const { agent } = await client.agent.create.mutate({
        computerId,
        displayName: 'Scout',
        handle: 'scout',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: server.id,
    });
    // The fake Computer has already accepted a run, so the human's message
    // queues onto it instead of dispatching a new one.
    const acceptedAt = new Date().toISOString();
    runPsql(
        session.databaseUrl,
        `insert into channel_agent_participants (server_id, chat_id, agent_id)
         values ('${server.id}', '${chatId}', '${agent.id}') on conflict do nothing;
         insert into agent_delivery (agent_id, server_id, active_run_id, active_run_chat_id,
             active_run_computer_id, active_run_runtime_id, active_run_model_id,
             active_run_reasoning_effort, accepted_at, dispatched_at)
         values ('${agent.id}', '${server.id}', '${runId}', '${chatId}', '${computerId}',
             'codex', 'gpt-5.6-sol', 'medium', '${acceptedAt}', '${acceptedAt}')
         on conflict (agent_id) do update set active_run_id = excluded.active_run_id,
             active_run_chat_id = excluded.active_run_chat_id,
             active_run_computer_id = excluded.active_run_computer_id,
             active_run_runtime_id = excluded.active_run_runtime_id,
             active_run_model_id = excluded.active_run_model_id,
             active_run_reasoning_effort = excluded.active_run_reasoning_effort,
             accepted_at = excluded.accepted_at, dispatched_at = excluded.dispatched_at`
    );
    const runner = await mintRunner(agent.id, chatId);

    await openChannel(page, 'all');
    const typing = page.locator('[data-slot="chat-typing"]');
    await expect(typing).toBeEmpty();
    const composer = page.getByRole('textbox', { name: 'Message all' });
    await composer.fill('Scout, can you check the build?');
    await composer.press('Enter');
    await expect(page.getByText('Scout, can you check the build?')).toBeVisible();
    await expect(typing).toBeEmpty();

    // The run reads its inbox: the Chat is engaged and the reader sees typing.
    await expect
        .poll(async () => {
            const pulled = (await runnerRequest(runner, '/api/agent/events')) as {
                messages?: unknown[];
            };
            return pulled.messages?.length ?? 0;
        })
        .toBeGreaterThan(0);
    await expect(typing.getByText('Scout is typing', { exact: true })).toBeVisible();

    // The reply lands and the engagement ends with it.
    await runnerRequest(runner, '/api/agent/messages/send', {
        content: 'On it — the build is green.',
        nonce: 'e2e-chat-typing-reply',
        target: '#all',
    });
    await expect(page.getByText('On it — the build is green.')).toBeVisible();
    await expect(typing).toBeEmpty();
});

async function mintRunner(agentId: string, chatId: string) {
    const response = await fetch(`${hausOrigin()}/computer/runner/mint`, {
        body: JSON.stringify({ agentId, chatId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`The typing test could not mint a runner: ${response.status}`);
    }
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}

async function runnerRequest(token: string, path: string, body?: unknown) {
    const response = await fetch(`${hausOrigin()}${path}`, {
        ...(body === undefined ? {} : { body: JSON.stringify(body), method: 'POST' }),
        headers: {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
        throw new Error(`${path} failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
}

function hausOrigin() {
    return `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}`;
}
