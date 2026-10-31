import { afterAll, beforeAll, expect, test } from 'bun:test';
import { reminderCadenceSummary } from '../src/automations/automation-summary.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let chatId: string;
let anchorId: string;
const agentId = 'agt_rollback_writer';
const firedAt = new Date('2026-09-07T12:00:00Z');

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('rollback_owner'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Rollback writes',
        slug: 'rollback-writes',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    anchorId = await message('anchor');
    await harness.sql`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
        VALUES (${agentId}, ${serverId}, 'rollback-agent', 'Rollback Agent', 'UTC')`;
    await harness.sql`INSERT INTO triggers
        (id, server_id, owner_agent_id, anchor_chat_id, kind, status, title, secret_hash, created_at, updated_at)
        VALUES ('trg_rollback', ${serverId}, ${agentId}, ${chatId}, 'webhook', 'armed',
            'Original trigger', 'unused', now(), now())`;
    await harness.sql`INSERT INTO trigger_fires
        (id, server_id, trigger_id, payload, payload_bytes, received_at)
        VALUES ('trf_rollback', ${serverId}, 'trg_rollback', '', 0, ${firedAt})`;
    await harness.sql`INSERT INTO reminders
        (id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id, title,
         timezone, status, fire_at, created_at, updated_at)
        VALUES ('rem_rollback', ${serverId}, ${agentId}, ${chatId}, ${anchorId},
            'Original reminder', 'UTC', 'fired', ${firedAt}, now(), now())`;
    await harness.sql`INSERT INTO reminder_fires (id, server_id, reminder_id, fired_at, scheduled_for)
        VALUES ('rmf_rollback', ${serverId}, 'rem_rollback', ${firedAt}, ${firedAt})`;
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test.each([
    null,
    'daily@09:00',
    'weekly:mon,wed@13:15',
    'every:1m',
    'every:2m',
    'every:60m',
    'every:2h',
    'every:1d',
    'every:2d',
])('old reminder writer snapshots %s', async (repeat) => {
    await harness.sql`UPDATE reminders SET repeat = ${repeat} WHERE id = 'rem_rollback'`;
    const id = await message(`reminder-${repeat}`);
    // Exact column set used by Server v1.13.0, before provenance snapshots.
    await harness.sql`INSERT INTO message_causes
        (attribution, kind, message_id, reminder_fire_id, reminder_id, server_id)
        VALUES ('inferred', 'reminder_fire', ${id}, 'rmf_rollback', 'rem_rollback', ${serverId})`;
    expect(await snapshot(id)).toEqual({
        anchor_chat_id: chatId,
        fired_at: firedAt,
        owner_agent_id: agentId,
        summary: reminderCadenceSummary(repeat),
        title: 'Original reminder',
    });
});

test('old trigger writes preserve provenance after the source is deleted', async () => {
    const id = await message('trigger');
    await harness.sql`INSERT INTO message_causes
        (attribution, kind, message_id, trigger_fire_id, trigger_id, server_id)
        VALUES ('explicit', 'trigger_fire', ${id}, 'trf_rollback', 'trg_rollback', ${serverId})`;
    const original = await snapshot(id);
    expect(original).toEqual({
        anchor_chat_id: chatId,
        fired_at: firedAt,
        owner_agent_id: agentId,
        summary: 'Webhook',
        title: 'Original trigger',
    });
    await harness.sql`DELETE FROM triggers WHERE id = 'trg_rollback'`;
    expect(await snapshot(id)).toEqual(original);
    const transcript = await owner.trpc.chat.messages.query({ chatId, serverId, limit: 50 });
    expect(transcript.messages.find((row) => row.id === id)?.cause).toMatchObject({
        title: 'Original trigger',
        summary: 'Webhook',
        live: null,
    });
});

test('current writers retain supplied snapshots without needing live source records', async () => {
    const id = await message('current');
    await harness.sql`INSERT INTO message_causes
        (attribution, kind, message_id, trigger_fire_id, trigger_id, server_id,
         anchor_chat_id, fired_at, owner_agent_id, summary, title)
        VALUES ('explicit', 'trigger_fire', ${id}, 'trf_archived', 'trg_archived', ${serverId},
            ${chatId}, ${firedAt}, ${agentId}, 'Recorded summary', 'Recorded title')`;
    expect(await snapshot(id)).toMatchObject({
        summary: 'Recorded summary',
        title: 'Recorded title',
    });
});

test('old writes cannot borrow a fire from another Server', async () => {
    const other = await owner.trpc.server.create.mutate({
        displayName: 'Other',
        slug: 'other-rollback',
    });
    const sent = await owner.trpc.chat.send.mutate({
        chatId: other.channels[0].id,
        serverId: other.id,
        content: 'Wrong scope',
        nonce: 'wrong-scope',
    });
    await expect(
        Promise.resolve(harness.sql`INSERT INTO message_causes
        (attribution, kind, message_id, reminder_fire_id, reminder_id, server_id)
        VALUES ('explicit', 'reminder_fire', ${sent.message.id}, 'rmf_rollback', 'rem_rollback', ${other.id})`)
    ).rejects.toThrow('Cannot resolve message cause snapshot');
});

async function message(nonce: string) {
    return (await owner.trpc.chat.send.mutate({ chatId, serverId, content: nonce, nonce })).message
        .id;
}

async function snapshot(messageId: string) {
    const [row] = await harness.sql`SELECT anchor_chat_id, fired_at, owner_agent_id, summary, title
        FROM message_causes WHERE message_id = ${messageId}`;
    return row;
}
