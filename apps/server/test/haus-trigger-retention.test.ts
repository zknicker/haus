import { afterAll, beforeAll, expect, test } from 'bun:test';
import { requeueInboxItemsForRun } from '../src/agent-delivery/store.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { deleteExpiredTriggerHistory } from '../src/triggers/retention-sweep.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Trigger history has two independent clocks, matching Reminder history: a
 * fire expires from `received_at`, while a removed Trigger tombstone expires
 * from `deleted_at`. Any non-seen Agent inbox row is unfinished work and blocks
 * both deletes. Provenance is not part of this retention graph.
 */

let agentId: string;
let channelId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

const sweptAt = new Date('2026-09-04T12:00:00.000Z');

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_trigger_retention')
    );
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Trigger Retention Server',
        slug: 'trigger-retention-server',
    });
    serverId = server.id;
    channelId = server.channels[0].id;
    agentId = 'agt_trigger_retention';
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${serverId}, 'retention-trigger', 'Trigger Retention', 'UTC')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${channelId}, ${agentId})
    `;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

test('expires a removed Trigger and its fires after the shared 30-day window', async () => {
    const created = await createTrigger('expired-removed');
    const fireId = await fire(created.trigger.id, created.secret);
    const expiredAt = daysBeforeSweep(31);
    await ageTrigger(created.trigger.id, fireId, expiredAt);
    await markFireSeen(fireId);

    const deleted = await deleteExpiredTriggerHistory(connection.db, sweptAt);

    expect(deleted).toContain(created.trigger.id);
    expect(await countRows('triggers', created.trigger.id, 'id')).toBe(0);
    expect(await countRows('trigger_fires', fireId, 'id')).toBe(0);
});

test('expires an old fire independently while its Trigger remains', async () => {
    const created = await createTrigger('old-fire');
    const fireId = await fire(created.trigger.id, created.secret);
    await ageFire(fireId, daysBeforeSweep(31));
    await markFireSeen(fireId);

    await deleteExpiredTriggerHistory(connection.db, sweptAt);

    expect(await countRows('triggers', created.trigger.id, 'id')).toBe(1);
    expect(await countRows('trigger_fires', fireId, 'id')).toBe(0);
});

test('keeps an expired removed Trigger while its fire is not yet seen', async () => {
    const created = await createTrigger('pending-fire');
    const fireId = await fire(created.trigger.id, created.secret);
    const expiredAt = daysBeforeSweep(31);
    await ageTrigger(created.trigger.id, fireId, expiredAt);

    await deleteExpiredTriggerHistory(connection.db, sweptAt);

    expect(await countRows('triggers', created.trigger.id, 'id')).toBe(1);
    expect(await countRows('trigger_fires', fireId, 'id')).toBe(1);

    await markFireSeen(fireId);
    const deleted = await deleteExpiredTriggerHistory(connection.db, sweptAt);

    expect(deleted).toContain(created.trigger.id);
    expect(await countRows('trigger_fires', fireId, 'id')).toBe(0);
});

test('keeps a recent removed Trigger and fire inside the window', async () => {
    const created = await createTrigger('recent-removed');
    const fireId = await fire(created.trigger.id, created.secret);
    const recentAt = daysBeforeSweep(10);
    await ageTrigger(created.trigger.id, fireId, recentAt);
    await markFireSeen(fireId);

    await deleteExpiredTriggerHistory(connection.db, sweptAt);

    expect(await countRows('triggers', created.trigger.id, 'id')).toBe(1);
    expect(await countRows('trigger_fires', fireId, 'id')).toBe(1);
});

test('drops a removed fire when its failed run would otherwise requeue it', async () => {
    const created = await createTrigger('failed-run');
    const fireId = await fire(created.trigger.id, created.secret);
    await harness.sql`
        update agent_inbox
        set run_id = 'run_trigger_retention_failed', state = 'accepted'
        where server_id = ${serverId} and dedupe_key = ${fireId}
    `;
    await owner.trpc.trigger.delete.mutate({ serverId, triggerId: created.trigger.id });

    await requeueInboxItemsForRun(connection.db, {
        agentId,
        runId: 'run_trigger_retention_failed',
    });

    expect(await countRows('agent_inbox', fireId, 'dedupe_key')).toBe(0);
});

test('removing a Trigger retains its history while hiding active access', async () => {
    const created = await createTrigger('removed-api');
    const fireId = await fire(created.trigger.id, created.secret);

    await owner.trpc.trigger.delete.mutate({ serverId, triggerId: created.trigger.id });

    expect(await countRows('triggers', created.trigger.id, 'id')).toBe(1);
    expect(await countRows('trigger_fires', fireId, 'id')).toBe(1);
    await expect(owner.trpc.trigger.list.query({ agentId, serverId })).resolves.toEqual(
        expect.not.arrayContaining([expect.objectContaining({ id: created.trigger.id })])
    );
    await expect(owner.trpc.trigger.history.query({ agentId, serverId })).resolves.toContainEqual(
        expect.objectContaining({
            fireId,
            title: 'removed-api',
            triggerDeletedAt: expect.any(String),
            triggerId: created.trigger.id,
        })
    );
    await expect(
        owner.trpc.trigger.runs.query({ serverId, triggerId: created.trigger.id })
    ).rejects.toThrow(/does not exist/i);
});

test('history links the first caused Agent answer without adding a receipt', async () => {
    const created = await createTrigger('answered-api');
    const fireId = await fire(created.trigger.id, created.secret);
    const [fireRow] = (await harness.sql`
        select received_at from trigger_fires where server_id = ${serverId} and id = ${fireId}
    `) as { received_at: Date }[];
    const answer = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Handled the event.',
        nonce: 'trigger-retention-answer',
        serverId,
    });
    await harness.sql`
        insert into message_causes (
            anchor_chat_id, attribution, fired_at, kind, message_id, owner_agent_id,
            server_id, summary, title, trigger_fire_id, trigger_id
        ) values (
            ${channelId}, 'explicit', ${fireRow.received_at}, 'trigger_fire',
            ${answer.message.id}, ${agentId}, ${serverId}, 'Webhook', 'answered-api',
            ${fireId}, ${created.trigger.id}
        )
    `;

    const history = await owner.trpc.trigger.history.query({ agentId, serverId });

    expect(history).toContainEqual(
        expect.objectContaining({
            answer: { chatId: channelId, messageId: answer.message.id },
            fireId,
            triggerDeletedAt: null,
        })
    );
    const receipts = (await harness.sql`
        select id from chat_messages
        where server_id = ${serverId} and content = ${'⚡ Trigger: answered-api'}
    `) as { id: string }[];
    expect(receipts).toEqual([]);
});

async function createTrigger(title: string) {
    return await owner.trpc.trigger.create.mutate({
        agentId,
        kind: 'webhook',
        serverId,
        title,
    });
}

async function fire(triggerId: string, secret: string, payload = '') {
    const response = await fetch(new URL(`/api/triggers/${triggerId}`, harness.url), {
        body: payload,
        headers: { authorization: `Bearer ${secret}` },
        method: 'POST',
    });
    if (!response.ok) {
        throw new Error(`Expected Trigger fire, received ${response.status}.`);
    }
    return ((await response.json()) as { fireId: string }).fireId;
}

async function ageTrigger(triggerId: string, fireId: string, at: Date) {
    await harness.sql`
        update triggers
        set deleted_at = ${at}, disabled_at = ${at}, status = 'disabled', updated_at = ${at}
        where server_id = ${serverId} and id = ${triggerId}
    `;
    await ageFire(fireId, at);
}

async function ageFire(fireId: string, at: Date) {
    await harness.sql`
        update trigger_fires
        set received_at = ${at}
        where server_id = ${serverId} and id = ${fireId}
    `;
}

async function markFireSeen(fireId: string) {
    await harness.sql`
        update agent_inbox
        set state = 'seen', seen_at = ${sweptAt}, settled_run_id = 'run_trigger_retention'
        where server_id = ${serverId} and dedupe_key = ${fireId}
    `;
}

function daysBeforeSweep(days: number) {
    return new Date(sweptAt.getTime() - days * 24 * 60 * 60 * 1000);
}

async function countRows(table: string, id: string, column: string) {
    const rows = (await harness.sql.unsafe(
        `select count(*)::int as total from ${table} where ${column} = $1`,
        [id]
    )) as { total: number }[];
    return rows[0]?.total ?? 0;
}
