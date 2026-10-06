import { afterAll, beforeAll, expect, test } from 'bun:test';
import { AgentDelivery, type DeliveryTransport } from '../src/agent-delivery/delivery.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { tickReminders } from '../src/reminders/reminders.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * A Reminder's title is a short label and its description is the instruction
 * (specs/reminders.md): the Agent API refuses a sentence title with the format
 * to use instead, the fire hands the description back to the Agent, and the
 * answer's cause carries both.
 */

let agentId: string;
let anchorMessageId: string;
let channelId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let runnerToken: string;
let serverId: string;

const computerId = 'cmp_reminderlabels1x';
const credentialHash = 'd'.repeat(64);
const codexRuntime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };
const description = 'Check advertising and flag campaigns that need bid adjustments';

class OfflineTransport implements DeliveryTransport {
    isOnline(): boolean {
        return false;
    }

    send(): boolean {
        return false;
    }
}

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_labels_owner'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reminder Labels',
        slug: 'reminder-labels',
    });
    serverId = server.id;
    channelId = server.channels[0].id;
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = 'user_labels_owner'
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
        values (${serverId}, ${channelId}, ${agentId}) on conflict do nothing
    `;
    anchorMessageId = (
        await owner.trpc.chat.send.mutate({
            chatId: channelId,
            content: 'Review the ads every Monday',
            nonce: 'labels_anchor',
            serverId,
        })
    ).message.id;
    runnerToken = await beginRun('run_labels_1');
});

afterAll(async () => {
    owner?.close();
    await connection?.close();
    await harness?.close();
});

test('refuses a sentence title with the label format to use instead', async () => {
    const refused = await agentRequest('POST', '/api/agent/reminders/schedule', {
        commandId: 'labels-sentence',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        messageId: anchorMessageId,
        title: 'Check advertising every Monday and look for campaigns that need bid adjustments',
    });

    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
        code: 'INVALID_ARG',
        message:
            'Reminder title must be one line of at most 60 characters: a short label like a calendar invite subject, such as "Monday Advertising Review". Put the full instruction in --description.',
    });
});

test('a schedule command id reused for different input is refused as a reused key', async () => {
    const input = {
        commandId: 'labels-reused-key',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        messageId: anchorMessageId,
        title: 'CI Check',
    };
    expect((await agentRequest('POST', '/api/agent/reminders/schedule', input)).status).toBe(200);

    const reused = await agentRequest('POST', '/api/agent/reminders/schedule', {
        ...input,
        title: 'Deploy Check',
    });

    expect(reused).toMatchObject({ body: { code: 'IDEMPOTENCY_KEY_REUSED' }, status: 409 });
});

test('relabels title and description together and hands the description to the fire', async () => {
    const scheduled = await agentRequest('POST', '/api/agent/reminders/schedule', {
        commandId: 'labels-schedule',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        messageId: anchorMessageId,
        title: 'Ads Review',
    });
    expect(scheduled.body.reminder).toMatchObject({ description: null, title: 'Ads Review' });
    const relabeled = await agentRequest('POST', '/api/agent/reminders/update', {
        commandId: 'labels-relabel',
        description,
        expectedVersion: scheduled.body.reminder?.version,
        id: scheduled.body.reminder?.id,
        title: 'Monday Advertising Review',
    });
    expect(relabeled.body.reminder).toMatchObject({
        description,
        title: 'Monday Advertising Review',
    });

    await tickReminders(
        connection.db,
        { now: () => new Date(Date.now() + 7_200_000) },
        new AgentDelivery(connection.db, new OfflineTransport())
    );
    const [fire] = (await harness.sql`
        select id from reminder_fires where reminder_id = ${scheduled.body.reminder?.id}
    `) as { id: string }[];
    const pulled = await agentRequest('GET', '/api/agent/events');
    expect(pulled.body.automations?.find((row) => row.id === fire.id)?.content).toBe(
        [
            '🔔 Reminder: Monday Advertising Review',
            `  ${description}`,
            `fire=${fire.id}`,
            `reply with: haus message send --cause ${fire.id}`,
        ].join('\n')
    );

    const sent = await agentRequest('POST', '/api/agent/messages/send', {
        cause: fire.id,
        content: 'Two campaigns need lower bids.',
        nonce: `labels-answer-${fire.id}`,
        target: '#all',
    });
    const messageId = sent.body.message?.id ?? '';
    const transcript = await owner.trpc.chat.messages.query({
        chatId: channelId,
        limit: 20,
        serverId,
    });
    expect(transcript.messages.find((message) => message.id === messageId)?.cause).toMatchObject({
        description,
        kind: 'reminder',
        title: 'Monday Advertising Review',
    });
});

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
            automations?: Array<{ content: string; id: string }>;
            code?: string;
            message?: { id?: string } | string;
            reminder?: { description: string | null; id: string; title: string; version: number };
        },
        status: response.status,
    };
}

async function beginRun(runId: string) {
    const response = await fetch(new URL('/computer/runner/mint', harness.url), {
        body: JSON.stringify({ agentId, chatId: channelId, credentialHash, runId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`mint failed: ${response.status}`);
    }
    // The Computer is offline in this harness, so the run the pull needs is
    // accepted here the way `beginActiveRun` plus an ack would accept it.
    await harness.sql`
        insert into agent_delivery (
            agent_id, server_id, active_run_id, active_run_chat_id, active_run_computer_id,
            active_run_model_id, active_run_reasoning_effort, active_run_runtime_id,
            accepted_at, dispatched_at
        )
        values (
            ${agentId}, ${serverId}, ${runId}, ${channelId}, ${computerId},
            'gpt-5.6-sol', 'medium', 'codex', now(), now()
        )
        on conflict (agent_id) do update set
            active_run_id = excluded.active_run_id,
            active_run_chat_id = excluded.active_run_chat_id,
            active_run_computer_id = excluded.active_run_computer_id,
            active_run_model_id = excluded.active_run_model_id,
            active_run_reasoning_effort = excluded.active_run_reasoning_effort,
            active_run_runtime_id = excluded.active_run_runtime_id,
            accepted_at = now(),
            dispatched_at = now()
    `;
    return ((await response.json()) as { runnerToken: string }).runnerToken;
}
