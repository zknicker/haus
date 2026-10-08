import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { listReminders, scheduleReminder, tickReminders } from '../src/reminders/reminders.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// Agents run on UTC home time; a calendar reminder recurs in the zone of the
// human it is for (ADR 0040).
const agentId = 'agt_calendar_author';
let anchorMessageId: string;
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_calendar_owner'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Calendar Server',
        slug: 'calendar-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Weekly review, Mondays at 3:57 PM Eastern.',
        nonce: 'calendar-anchor',
        serverId,
    });
    anchorMessageId = anchor.message.id;
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${serverId}, 'calendar-cove', 'Cove', 'UTC')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${agentId})
    `;
});

afterAll(async () => {
    owner.close();
    await connection.close();
    await harness.close();
});

// Production regression: a weekly 3:57 PM Eastern review fired right once,
// then snapped to 15:57 UTC because fireAt and the cadence were independent.
test('derives a calendar first fire in the requester zone and keeps every fire on it', async () => {
    const input = {
        anchorChatId: chatId,
        anchorMessageId,
        commandId: 'reminder-command-derived-weekly',
        repeat: 'weekly:mon@15:57',
        serverId,
        timezone: 'America/New_York',
        title: 'Weekly Review',
    };
    const scheduled = await scheduleReminder(connection.db, agentId, input, {
        now: () => new Date('2026-10-08T12:00:00.000Z'),
    });
    expect(scheduled.reminder).toMatchObject({
        fireAt: '2026-10-12T19:57:00.000Z',
        timezone: 'America/New_York',
    });
    // The derived first fire is not part of the request, so a replay after
    // that slot passed still matches the command.
    const replayed = await scheduleReminder(connection.db, agentId, input, {
        now: () => new Date('2026-10-20T12:00:00.000Z'),
    });
    expect(replayed).toMatchObject({
        idempotent: true,
        reminder: { id: scheduled.reminder.id },
    });

    await tickReminders(connection.db, { now: () => new Date('2026-10-12T19:57:30.000Z') });
    const [next] = (
        await listReminders(connection.db, { actor: { agentId, kind: 'agent' }, serverId })
    ).filter((reminder) => reminder.id === scheduled.reminder.id);
    expect(next?.fireAt).toBe('2026-10-19T19:57:00.000Z');

    await expect(
        scheduleReminder(
            connection.db,
            agentId,
            {
                ...input,
                commandId: 'reminder-command-off-slot-weekly',
                fireAt: new Date('2026-10-12T19:57:00.000Z'),
                timezone: 'UTC',
            },
            { now: () => new Date('2026-10-08T12:00:00.000Z') }
        )
    ).rejects.toThrow('is not a weekly:mon@15:57 slot in UTC');
    const { timezone: _omitted, ...homeZoned } = input;
    await expect(
        scheduleReminder(
            connection.db,
            agentId,
            { ...homeZoned, commandId: 'reminder-command-zoneless-weekly' },
            { now: () => new Date('2026-10-08T12:00:00.000Z') }
        )
    ).rejects.toThrow('needs an explicit IANA timezone');
});

test('a reminder zone must be a canonical IANA name, stored in its canonical case', async () => {
    const base = {
        anchorChatId: chatId,
        anchorMessageId,
        repeat: 'daily@09:00',
        serverId,
        title: 'Standup',
    };
    const now = { now: () => new Date('2026-10-08T12:00:00.000Z') };
    for (const timezone of ['+05:00', 'Eastern']) {
        await expect(
            scheduleReminder(
                connection.db,
                agentId,
                { ...base, commandId: `reminder-command-zone-${timezone}`, timezone },
                now
            )
        ).rejects.toThrow('valid IANA timezone');
    }
    const lowercase = await scheduleReminder(
        connection.db,
        agentId,
        { ...base, commandId: 'reminder-command-zone-lowercase', timezone: 'america/new_york' },
        now
    );
    expect(lowercase.reminder.timezone).toBe('America/New_York');
    const utc = await scheduleReminder(
        connection.db,
        agentId,
        { ...base, commandId: 'reminder-command-zone-utc', timezone: 'UTC' },
        now
    );
    expect(utc.reminder).toMatchObject({ fireAt: '2026-10-09T09:00:00.000Z', timezone: 'UTC' });
});
