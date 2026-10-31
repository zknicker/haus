import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * The member-scoped turn and delivery reads. Together they let an observer
 * prove a settled turn answered with silence instead of guessing from an empty
 * chat: `agent.turns` reports `outputProduced`, and `agent.deliveries` retains
 * the settled row with the turn that consumed it.
 */
let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let serverId: string;
let agentId: string;
let chatId: string;

const computerId = 'cmp_observability001';
const credentialHash = 'd'.repeat(64);
const runtime = { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] };

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('user_observability_owner');
    outsider = await signIn('user_observability_outsider');

    const server = await owner.trpc.server.create.mutate({
        displayName: 'Observability HQ',
        slug: 'observability-hq',
    });
    serverId = server.id;
    await outsider.trpc.server.create.mutate({
        displayName: 'Outsider Root',
        slug: 'outsider-root',
    });

    await insertComputer();
    const created = await owner.trpc.agent.create.mutate({
        computerId,
        description: 'Watches deploys and reports only when something matters.',
        displayName: 'Wren',
        handle: 'wren',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    agentId = created.agent.id;
    chatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;

    await insertTurn(1, { outputProduced: true, status: 'completed' });
    await insertTurn(2, {
        activity: {
            operations: [
                {
                    category: 'searching_web',
                    completed: 3,
                    failed: 0,
                    interrupted: 0,
                },
            ],
        },
        outputProduced: false,
        status: 'completed',
    });
    await insertTurn(3, { failureKind: 'timeout', outputProduced: false, status: 'failed' });

    await insertDelivery(1, { state: 'seen', settledRunId: 'run_observability002' });
    await insertDelivery(2, { state: 'queued', settledRunId: null });
});

afterAll(async () => {
    owner.close();
    outsider.close();
    await harness.close();
});

test('reports settled turns newest first with the evidence that proves silence', async () => {
    const turns = await owner.trpc.agent.turns.query({ agentId, serverId });

    expect(turns).toHaveLength(3);
    expect(turns.map((turn) => turn.runId)).toEqual([
        'run_observability003',
        'run_observability002',
        'run_observability001',
    ]);
    expect(turns[0]).toMatchObject({
        agentId,
        failureKind: 'timeout',
        messageCount: 0,
        outputProduced: false,
        status: 'failed',
    });
    // The silent turn: it completed, it produced nothing, and nothing failed.
    expect(turns[1]).toMatchObject({
        activity: { operations: [{ category: 'searching_web', completed: 3 }] },
        failureKind: null,
        messageCount: 0,
        outputProduced: false,
        status: 'completed',
    });
    expect(turns[2]).toMatchObject({ messageCount: 1, outputProduced: true, status: 'completed' });
});

test('honors the turn limit', async () => {
    const turns = await owner.trpc.agent.turns.query({ agentId, limit: 1, serverId });

    expect(turns).toHaveLength(1);
    expect(turns[0]?.runId).toBe('run_observability003');
});

test('reads one exact historical turn for Chat details', async () => {
    const turns = await owner.trpc.agent.turns.query({
        agentId,
        limit: 1,
        runId: 'run_observability001',
        serverId,
    });

    expect(turns.map((turn) => turn.runId)).toEqual(['run_observability001']);
});

test('reports the delivery ledger including rows retained after settlement', async () => {
    const deliveries = await owner.trpc.agent.deliveries.query({ agentId, serverId });

    expect(deliveries).toHaveLength(2);
    expect(deliveries[0]).toMatchObject({
        agentId,
        chatId,
        messageId: 'msg_observability002',
        seenAt: null,
        servedAt: null,
        state: 'queued',
        turnId: null,
    });
    expect(deliveries[1]).toMatchObject({
        messageId: 'msg_observability001',
        state: 'seen',
        turnId: 'run_observability002',
    });
    expect(deliveries[1]?.seenAt).not.toBeNull();
});

test('honors the delivery limit', async () => {
    const deliveries = await owner.trpc.agent.deliveries.query({ agentId, limit: 1, serverId });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.messageId).toBe('msg_observability002');
});

test('refuses both reads to a non-member', async () => {
    await expect(outsider.trpc.agent.turns.query({ agentId, serverId })).rejects.toThrow();
    await expect(outsider.trpc.agent.deliveries.query({ agentId, serverId })).rejects.toThrow();
});

test('refuses both reads for an unknown Agent id', async () => {
    const unknownAgentId = 'agt_unknownunknown01';

    await expect(
        owner.trpc.agent.turns.query({ agentId: unknownAgentId, serverId })
    ).rejects.toThrow(/No Agent exists/i);
    await expect(
        owner.trpc.agent.deliveries.query({ agentId: unknownAgentId, serverId })
    ).rejects.toThrow(/No Agent exists/i);
});

async function insertComputer() {
    const ownerUserId = await readUserId('user_observability_owner');
    const inventory = { runtimes: [runtime] };
    await harness.sql`
        insert into computers (
            id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
        )
        values (
            ${computerId},
            ${serverId},
            ${ownerUserId},
            ${credentialHash},
            ${inventory}::jsonb,
            'healthy'
        )
    `;
}

async function insertTurn(
    index: number,
    turn: {
        activity?: { operations: unknown[] };
        failureKind?: string;
        outputProduced: boolean;
        status: 'completed' | 'failed';
    }
) {
    const startedAt = new Date(Date.UTC(2026, 0, index)).toISOString();
    const endedAt = new Date(Date.UTC(2026, 0, index, 1)).toISOString();
    await harness.sql`
        insert into agent_turns (
            id, server_id, agent_id, computer_id, run_id, started_at, ended_at,
            status, summary, message_count, output_produced, failure_kind, activity
        )
        values (
            ${`atn_observability00${index}`},
            ${serverId},
            ${agentId},
            ${computerId},
            ${`run_observability00${index}`},
            ${startedAt}::timestamptz,
            ${endedAt}::timestamptz,
            ${turn.status},
            'settled',
            ${turn.outputProduced ? 1 : 0},
            ${turn.outputProduced},
            ${turn.failureKind ?? null},
            ${turn.activity ?? { operations: [] }}::jsonb
        )
    `;
}

async function insertDelivery(
    index: number,
    delivery: { settledRunId: string | null; state: 'queued' | 'seen' }
) {
    const createdAt = new Date(Date.UTC(2026, 0, index)).toISOString();
    const seenAt = delivery.state === 'seen' ? new Date(Date.UTC(2026, 0, index, 2)) : null;
    await harness.sql`
        insert into agent_inbox (
            id, server_id, agent_id, chat_id, content, dedupe_key, created_at,
            state, settled_run_id, seen_at, run_id
        )
        values (
            ${`inb_observability00${index}`},
            ${serverId},
            ${agentId},
            ${chatId},
            'deploy finished',
            ${`msg_observability00${index}`},
            ${createdAt}::timestamptz,
            ${delivery.state},
            ${delivery.settledRunId},
            ${seenAt ? seenAt.toISOString() : null}::timestamptz,
            ${delivery.settledRunId}
        )
    `;
}

async function signIn(subject: string) {
    const token = await harness.humans.mintSessionToken(subject);
    return createHausClient(harness, token);
}

async function readUserId(subject: string) {
    const rows = (await harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return rows[0].id;
}
