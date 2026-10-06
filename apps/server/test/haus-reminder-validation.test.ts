import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('reminder routes distinguish invalid credentials from malformed authenticated input', async () => {
    for (const action of ['schedule', 'snooze', 'update', 'cancel', 'log']) {
        const response = await fetch(
            new URL(`/api/agent/reminders/${action}`, fixture.harness.url),
            {
                ...(action === 'log' ? {} : { body: '{}', method: 'POST' }),
                headers: {
                    authorization: 'Bearer invalid-credential',
                    'content-type': 'application/json',
                },
            }
        );
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ code: 'MISSING_TOKEN' });
    }
    const runner = await fixture.mintRunner(
        'run_reminder_validation',
        fixture.coveAgentId,
        undefined,
        false
    );
    const invalidList = await fetch(
        new URL('/api/agent/reminders?status=scheduled&status=fired', fixture.harness.url),
        {
            headers: { authorization: `Bearer ${runner.token}` },
        }
    );
    expect(invalidList.status).toBe(400);
    expect(await invalidList.json()).toMatchObject({
        code: 'INVALID_ARG',
        message: expect.stringContaining('status'),
    });
    const response = await post(runner.token, 'schedule', {
        commandId: 'x'.repeat(129),
        fireAt: new Date(Date.now() + 86_400_000).toISOString(),
        messageId: 'msg_missing',
        title: 'Review',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
        code: 'INVALID_ARG',
        message: expect.stringContaining('commandId'),
    });
});

test('unsupported timezone changes fail before changing a reminder or recording a command', async () => {
    await fixture.harness.sql`
        insert into channel_agent_participants (server_id,chat_id,agent_id)
        values (${fixture.serverId},${fixture.channelId},${fixture.coveAgentId})
        on conflict do nothing
    `;
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Daily at 09:00 America/New_York. Keep this calendar zone.',
        nonce: 'validation-zone-consent',
        serverId: fixture.serverId,
    });
    const runner = await fixture.mintRunner(
        'run_reminder_strict',
        fixture.coveAgentId,
        undefined,
        false
    );
    const scheduleInput = {
        commandId: 'validation-schedule',
        fireAt: new Date(Date.now() + 86_400_000).toISOString(),
        messageId: anchor.message.id,
        repeat: 'daily@09:00',
        timezone: 'America/New_York',
        title: 'Review',
    };
    const invalidSchedule = await post(runner.token, 'schedule', {
        ...scheduleInput,
        unsupported: true,
    });
    expect(invalidSchedule.status).toBe(400);
    expect(await invalidSchedule.json()).toMatchObject({
        code: 'INVALID_ARG',
        message: expect.stringContaining('unsupported'),
    });
    const scheduled = await post(runner.token, 'schedule', scheduleInput);
    expect(scheduled.status).toBe(200);
    const { reminder } = await scheduled.json();
    for (const [action, fields] of [
        ['update', { repeat: 'weekly:fri@09:00' }],
        ['snooze', { by: '1h' }],
        ['cancel', {}],
    ] as const) {
        const response = await post(runner.token, action, {
            commandId: `validation-${action}`,
            expectedVersion: reminder.version,
            id: reminder.id,
            timezone: 'Asia/Tokyo',
            ...fields,
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            code: 'INVALID_ARG',
            message: expect.stringContaining('timezone'),
        });
    }
    const rows = await fixture.harness
        .sql`select timezone, repeat, version, status from reminders where id=${reminder.id}`;
    expect(rows).toEqual([
        {
            timezone: 'America/New_York',
            repeat: 'daily@09:00',
            version: reminder.version,
            status: 'scheduled',
        },
    ]);
    const commands = await fixture.harness
        .sql`select command_id from reminder_commands where reminder_id=${reminder.id}`;
    expect(commands).toEqual([{ command_id: 'validation-schedule' }]);
    const corrected = await post(runner.token, 'update', {
        commandId: 'validation-update',
        expectedVersion: reminder.version,
        id: reminder.id,
        repeat: 'weekly:fri@09:00',
    });
    expect(corrected.status).toBe(200);
    expect(await corrected.json()).toMatchObject({
        reminder: {
            timezone: 'America/New_York',
            repeat: 'weekly:fri@09:00',
            version: reminder.version + 1,
        },
    });
});

async function post(token: string, action: string, body: Record<string, unknown>) {
    return await fetch(new URL(`/api/agent/reminders/${action}`, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
}
