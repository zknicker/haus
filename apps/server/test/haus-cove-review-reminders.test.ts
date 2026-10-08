import { expect, test } from 'bun:test';
import { AGENT_IDEMPOTENCY_KEY_REUSED } from '@haus/api';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a persisted review command survives concurrency, Server restart, correction, and opt-out', async () => {
    await fixture.harness.sql`
        insert into channel_agent_participants (server_id,chat_id,agent_id)
        values (${fixture.serverId},${fixture.channelId},${fixture.coveAgentId})
        on conflict do nothing
    `;
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Review #product daily, quietly. Raise only new actionable findings.',
        nonce: 'review-consent',
        serverId: fixture.serverId,
    });
    const savedInput = {
        commandId: `cove-review-${anchor.message.id}-1`,
        fireAt: new Date(Date.now() + 86_400_000).toISOString(),
        messageId: anchor.message.id,
        repeat: 'every:1d',
        title: 'Team health review',
        description: 'Review agreed team health. Re-read consent and suppress unchanged findings.',
    };
    const runner = await fixture.mintRunner(
        'run_review_schedule',
        fixture.coveAgentId,
        undefined,
        false
    );
    const scheduled = await Promise.all([
        mutation(runner.token, 'schedule', savedInput),
        mutation(runner.token, 'schedule', savedInput),
    ]);
    expect(scheduled[1].reminder.id).toBe(scheduled[0].reminder.id);
    const id = scheduled[0].reminder.id;

    await fixture.harness.restart();
    const resumed = await fixture.mintRunner(
        'run_review_resume',
        fixture.coveAgentId,
        undefined,
        false
    );
    expect((await mutation(resumed.token, 'schedule', savedInput)).reminder.id).toBe(id);
    const corrected = await mutation(resumed.token, 'update', {
        commandId: 'review-correction',
        expectedVersion: 1,
        id,
        repeat: 'every:7d',
    });
    expect(corrected.reminder.repeat).toBe('every:7d');
    await mutation(resumed.token, 'cancel', {
        commandId: 'review-opt-out',
        expectedVersion: corrected.reminder.version,
        id,
    });
    // Replaying a saved creation receipt is never permission to resurrect its canceled row.
    const replay = await mutation(resumed.token, 'schedule', savedInput);
    expect(replay.reminder).toMatchObject({ status: 'canceled', repeat: 'every:7d' });
    const rows = await fixture.harness.sql`
        select id,status,repeat from reminders
        where server_id=${fixture.serverId} and owner_agent_id=${fixture.coveAgentId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, status: 'canceled', repeat: 'every:7d' });
});

async function mutation(token: string, action: string, body: Record<string, unknown>) {
    const response = await fetch(new URL(`/api/agent/reminders/${action}`, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const result = (await response.json()) as {
        reminder: { id: string; repeat: string; version: number; status: string };
    };
    expect(response.status).toBe(200);
    return result;
}

test('explicit recurrence timezone is durable, DST-aware, validated and part of replay identity', async () => {
    const refreshedOwner = await fixture.signIn('user_agent_creation_owner', ['ada@haus.test']);
    const anchor = await refreshedOwner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Friday review at 09:00 America/New_York across DST.',
        nonce: 'review-zone-consent',
        serverId: fixture.serverId,
    });
    refreshedOwner.close();
    const runner = await fixture.mintRunner(
        'run_review_zone',
        fixture.coveAgentId,
        undefined,
        false
    );
    const body = {
        commandId: 'review-explicit-zone',
        messageId: anchor.message.id,
        repeat: 'weekly:fri@09:00',
        timezone: 'America/New_York',
        title: 'Friday review',
    };
    const first = await mutation(runner.token, 'schedule', body);
    await fixture.harness.restart();
    const resumed = await fixture.mintRunner(
        'run_review_zone_resume',
        fixture.coveAgentId,
        undefined,
        false
    );
    const replay = await mutation(resumed.token, 'schedule', body);
    expect(replay.reminder.id).toBe(first.reminder.id);
    const [row] = await fixture.harness
        .sql`select repeat, timezone from reminders where id=${first.reminder.id}`;
    expect(row.timezone).toBe('America/New_York');
    const { nextReminderFireAt, parseReminderRepeat } = await import('../src/reminders/cadence.ts');
    expect(
        new Date(
            nextReminderFireAt(
                parseReminderRepeat(row.repeat)!,
                Date.parse('2026-10-30T13:00:00.000Z'),
                row.timezone
            )
        ).toISOString()
    ).toBe('2026-11-06T14:00:00.000Z');
    const [author] = await fixture.harness
        .sql`select home_timezone from agents where id=${fixture.coveAgentId}`;
    expect(author.home_timezone).toBe('UTC');
    for (const [commandId, timezone, code] of [
        [body.commandId, 'UTC', AGENT_IDEMPOTENCY_KEY_REUSED],
        ['review-invalid-zone', 'Invalid/Zone', 'INVALID_ARG'],
    ]) {
        const response = await fetch(
            new URL('/api/agent/reminders/schedule', fixture.harness.url),
            {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${resumed.token}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ ...body, commandId, timezone }),
            }
        );
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code });
    }
    const rows = await fixture.harness
        .sql`select id from reminders where server_id=${fixture.serverId} and title='Friday review'`;
    expect(rows).toHaveLength(1);
});

test('timezone capability discovery does not inspect inaccessible historical reminder anchors', async () => {
    const runner = await fixture.mintRunner(
        'run_review_capabilities',
        fixture.coveAgentId,
        undefined,
        false
    );
    await fixture.harness
        .sql`delete from channel_agent_participants where chat_id=${fixture.channelId} and agent_id=${fixture.coveAgentId}`;
    try {
        const options = { headers: { authorization: `Bearer ${runner.token}` } };
        const list = await fetch(new URL('/api/agent/reminders', fixture.harness.url), options);
        expect(list.status).toBe(409);
        const capabilities = await fetch(
            new URL('/api/agent/reminders/capabilities', fixture.harness.url),
            options
        );
        expect(capabilities.status).toBe(200);
        expect(await capabilities.json()).toEqual({ supportsReminderTimezone: true });
    } finally {
        await fixture.harness
            .sql`insert into channel_agent_participants(server_id,chat_id,agent_id) values (${fixture.serverId},${fixture.channelId},${fixture.coveAgentId}) on conflict do nothing`;
    }
});
