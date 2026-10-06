import { expect, test } from 'bun:test';
import { AGENT_IDEMPOTENCY_KEY_REUSED } from '@haus/api';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('pre-0060 schedule fingerprints and long titles replay current state after upgrade', async () => {
    const runner = await fixture.mintRunner('run_legacy_reminder');
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'An agreed delivery watch.',
        nonce: 'legacy-reminder-anchor',
        serverId: fixture.serverId,
    });
    const fireAt = new Date(Date.now() + 3_600_000).toISOString();
    const input = {
        commandId: 'legacy-schedule',
        fireAt,
        messageId: anchor.message.id,
        repeat: 'every:7d',
        title: 'Delivery watch',
    };
    const scheduled = await post(runner.token, input);
    expect(scheduled.status).toBe(200);
    const id = scheduled.body.reminder.id;
    const title =
        'Review delivery evidence in product and stay silent for unchanged gaps and healthy results.';
    // Golden pre-0060 fingerprint: exact historical key order, no description key.
    const fingerprint = JSON.stringify({
        anchorChatId: fixture.channelId,
        anchorMessageId: anchor.message.id,
        fireAt,
        repeat: 'every:7d',
        script: null,
        title,
    });
    await fixture.harness
        .sql`update reminder_commands set request_fingerprint=${fingerprint} where command_id='legacy-schedule' and server_id=${fixture.serverId}`;
    await fixture.harness
        .sql`update reminders set title=${title}, description=${title}, status='canceled', version=2 where id=${id}`;
    const replay = await post(runner.token, { ...input, title });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({
        replayed: true,
        reminder: { id, status: 'canceled', version: 2, description: title },
    });
    const conflict = await post(runner.token, {
        ...input,
        title,
        description: 'A different instruction.',
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe(AGENT_IDEMPOTENCY_KEY_REUSED);
    expect(conflict.body.message).toContain('command');
    const fresh = await post(runner.token, { ...input, commandId: 'new-long-title', title });
    expect(fresh.status).toBe(409);
    expect(fresh.body.message).toContain('60');
    const [count] = await fixture.harness
        .sql`select count(*)::int as count from reminders where server_id=${fixture.serverId}`;
    expect(count.count).toBe(1);
});

async function post(
    token: string,
    body: Record<string, unknown>,
    path = '/api/agent/reminders/schedule'
) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return { status: response.status, body: await response.json() };
}

test('an unsent schedule whose saved fire time passed gives an actionable revision refusal', async () => {
    const runner = await fixture.mintRunner('run_missed_first_slot');
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Weekly agreed review.',
        nonce: 'missed-slot-anchor',
        serverId: fixture.serverId,
    });
    const result = await post(runner.token, {
        commandId: 'never-landed',
        fireAt: new Date(Date.now() - 1000).toISOString(),
        messageId: anchor.message.id,
        repeat: 'every:7d',
        title: 'Weekly review',
    });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('REMINDER_FIRE_TIME_PASSED');
    expect(result.body.nextAction).toContain('new command id');
    expect(result.body.nextAction).toContain('haus reminder list');
});

test('main 0060 fingerprint bytes replay and malformed added recurrence cannot alias them', async () => {
    const runner = await fixture.mintRunner('run_main_reminder_bytes');
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'One checkpoint.',
        nonce: 'main-bytes-anchor',
        serverId: fixture.serverId,
    });
    const input = {
        commandId: 'main-bytes',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        messageId: anchor.message.id,
        title: ' Checkpoint ',
        description: ' Verify receipt. ',
    };
    const created = await post(runner.token, input);
    expect(created.status).toBe(200);
    // 5b00c901 scheduleReminder historical object order and normalized bytes.
    const golden = JSON.stringify({
        anchorChatId: fixture.channelId,
        anchorMessageId: anchor.message.id,
        description: 'Verify receipt.',
        fireAt: input.fireAt,
        repeat: null,
        script: null,
        title: 'Checkpoint',
    });
    const [row] = await fixture.harness
        .sql`select request_fingerprint from reminder_commands where command_id='main-bytes' and server_id=${fixture.serverId}`;
    expect(row.request_fingerprint).toBe(golden);
    expect((await post(runner.token, input)).body.replayed).toBe(true);
    const conflict = await post(runner.token, { ...input, repeat: 'not-a-cadence' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe(AGENT_IDEMPOTENCY_KEY_REUSED);
    const update = {
        commandId: 'golden-legacy-update',
        expectedVersion: 1,
        id: created.body.reminder.id,
        title: 'Changed checkpoint',
    };
    const changed = await post(runner.token, update, '/api/agent/reminders/update');
    expect(changed.status).toBe(200);
    // d031 update encoding, also unchanged on 5b00c901 when description is absent.
    const legacyUpdate = JSON.stringify({
        action: 'update',
        expectedVersion: 1,
        reminderId: update.id,
        title: update.title,
    });
    const [updateRow] = await fixture.harness
        .sql`select request_fingerprint from reminder_commands where command_id='golden-legacy-update' and server_id=${fixture.serverId}`;
    expect(updateRow.request_fingerprint).toBe(legacyUpdate);
    expect((await post(runner.token, update, '/api/agent/reminders/update')).body.replayed).toBe(
        true
    );
});
