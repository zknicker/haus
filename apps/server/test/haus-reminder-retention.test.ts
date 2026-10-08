import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readMessageCauses } from '../src/automations/message-cause-read.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { cancelReminder, scheduleReminder, tickReminders } from '../src/reminders/reminders.ts';
import { deleteExpiredReminderHistory } from '../src/reminders/retention-sweep.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * Reminder history is deleted 30 days after it happened
 * (`REMINDER_HISTORY_RETENTION_DAYS`). Each fire expires on its own `fired_at`
 * clock, and a settled reminder — a fired one-shot or a canceled reminder —
 * expires on its `updated_at`. A recurring reminder never settles, so it is
 * never swept and only its old fires drop away. A fire whose wake is still
 * queued for its Agent is unfinished business and is never swept, however old;
 * the Agent seeing it is what lets it expire. The Agent's answer to a swept
 * fire stays in the transcript and keeps its provenance mark, which reads
 * archived from the snapshot the cause carries (ADR 0026).
 */

let agentId: string;
let anchorMessageId: string;
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

/** The sweep's reference "now"; every fixture is placed relative to it. */
const sweptAt = new Date('2026-09-04T12:00:00.000Z');

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_retention'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Retention Server',
        slug: 'retention-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Anchor for retention.',
        nonce: 'retention-anchor',
        serverId,
    });
    anchorMessageId = anchor.message.id;
    agentId = 'agt_retention_author';
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${serverId}, 'retention-cove', 'Cove', 'America/New_York')
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

test('deletes a one-shot reminder and its run history once it has been settled 30 days', async () => {
    const reminder = await fireOneShot('retention-expired', daysBeforeSweep(31));
    await handleWakes(reminder.id);

    const deleted = await deleteExpiredReminderHistory(connection.db, sweptAt);

    expect(deleted).toContain(reminder.id);
    expect(await countRows('reminders', reminder.id, 'id')).toBe(0);
    expect(await countRows('reminder_fires', reminder.id)).toBe(0);
    expect(await countRows('reminder_commands', reminder.id)).toBe(0);
    expect(await countRows('reminder_agent_attention', reminder.id)).toBe(0);
});

test('keeps a reminder that fired 10 days ago', async () => {
    const reminder = await fireOneShot('retention-recent', daysBeforeSweep(10));

    await deleteExpiredReminderHistory(connection.db, sweptAt);

    expect(await countRows('reminders', reminder.id, 'id')).toBe(1);
    expect(await countRows('reminder_fires', reminder.id)).toBe(1);
});

test('keeps a recurring reminder and its recent fire, dropping the expired one', async () => {
    const reminder = await fireOneShot('retention-recurring', daysBeforeSweep(40), {
        repeat: 'every:1d',
    });
    await tickReminders(connection.db, { now: () => daysBeforeSweep(2) });
    const [row] = (await harness.sql`
        select status from reminders where id = ${reminder.id}
    `) as { status: string }[];
    expect(row.status).toBe('scheduled');
    expect(await countRows('reminder_fires', reminder.id)).toBe(2);
    expect(await countRows('reminder_agent_attention', reminder.id)).toBe(2);

    // The old wake has been seen; the recent one is still queued.
    await handleWakes(reminder.id, daysBeforeSweep(40));

    await deleteExpiredReminderHistory(connection.db, sweptAt);

    // The reminder never settles, so it stays; the 40-day-old fire is history
    // past its window, its wake handled, and goes on its own.
    expect(await countRows('reminders', reminder.id, 'id')).toBe(1);
    const fires = (await harness.sql`
        select fired_at from reminder_fires where reminder_id = ${reminder.id}
    `) as { fired_at: Date }[];
    expect(fires).toHaveLength(1);
    expect(fires[0].fired_at.getTime()).toBe(daysBeforeSweep(2).getTime());
    expect(await countRows('reminder_agent_attention', reminder.id)).toBe(1);
});

test('keeps an expired fire whose wake is still queued for its Agent', async () => {
    const reminder = await fireOneShot('retention-pending-wake', daysBeforeSweep(40));

    await deleteExpiredReminderHistory(connection.db, sweptAt);

    // The Agent has not seen this wake, so the fire is not history yet and
    // neither it nor the reminder that owns it may be swept.
    expect(await countRows('reminders', reminder.id, 'id')).toBe(1);
    expect(await countRows('reminder_fires', reminder.id)).toBe(1);
    expect(await countRows('reminder_agent_attention', reminder.id)).toBe(1);

    await handleWakes(reminder.id);
    const deleted = await deleteExpiredReminderHistory(connection.db, sweptAt);

    expect(deleted).toContain(reminder.id);
    expect(await countRows('reminder_fires', reminder.id)).toBe(0);
});

test('deletes a reminder canceled more than 30 days ago', async () => {
    const scheduled = await scheduleReminder(
        connection.db,
        agentId,
        {
            anchorChatId: chatId,
            anchorMessageId,
            commandId: 'retention-canceled-schedule',
            fireAt: new Date('2027-01-01T09:00:00.000Z'),
            serverId,
            title: 'Canceled long ago',
        },
        { now: () => new Date('2026-01-01T09:00:00.000Z') }
    );
    await cancelReminder(
        connection.db,
        agentId,
        {
            commandId: 'retention-canceled-cancel',
            expectedVersion: scheduled.reminder.version,
            reminderId: scheduled.reminder.id,
            serverId,
        },
        { now: () => daysBeforeSweep(45) }
    );

    const deleted = await deleteExpiredReminderHistory(connection.db, sweptAt);

    expect(deleted).toContain(scheduled.reminder.id);
    expect(await countRows('reminders', scheduled.reminder.id, 'id')).toBe(0);
});

test("leaves a swept fire's answer marked with the automation that provoked it", async () => {
    const reminder = await fireOneShot('retention-provenance', daysBeforeSweep(31));
    const [fire] = (await harness.sql`
        select id, fired_at from reminder_fires where reminder_id = ${reminder.id}
    `) as { fired_at: Date; id: string }[];
    await handleWakes(reminder.id);
    const answer = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Deployment looks healthy.',
        nonce: 'retention-provenance-answer',
        serverId,
    });
    await harness.sql`
        insert into message_causes (
            anchor_chat_id, attribution, fired_at, kind, message_id, owner_agent_id,
            reminder_fire_id, reminder_id, server_id, summary, title
        )
        values (
            ${chatId}, 'explicit', ${fire.fired_at}, 'reminder_fire', ${answer.message.id},
            ${agentId}, ${fire.id}, ${reminder.id}, ${serverId}, 'One time',
            'Reminder retention-provenance'
        )
    `;
    expect(
        (await readMessageCauses(connection.db, serverId, [answer.message.id])).get(
            answer.message.id
        )
    ).toMatchObject({ automationId: reminder.id, kind: 'reminder', live: expect.any(Object) });

    await deleteExpiredReminderHistory(connection.db, sweptAt);

    // The provenance row outlives the reminder (ADR 0026): the mark still names
    // the reminder from its snapshot, and only the live half of it goes.
    expect(await countRows('message_causes', reminder.id, 'reminder_id')).toBe(1);
    const transcript = await owner.trpc.chat.messages.query({ chatId, limit: 50, serverId });
    const rendered = transcript.messages.find((message) => message.id === answer.message.id);
    expect(rendered?.content).toBe('Deployment looks healthy.');
    expect(rendered?.cause).toEqual({
        attribution: 'explicit',
        automationId: reminder.id,
        description: null,
        firedAt: fire.fired_at.toISOString(),
        fireId: fire.id,
        kind: 'reminder',
        live: null,
        ownerAgentId: agentId,
        summary: 'One time',
        title: 'Reminder retention-provenance',
    });
    // The context card answers from the snapshot instead of faulting.
    const context = await owner.trpc.automation.fireContext.query({
        messageId: answer.message.id,
        serverId,
    });
    expect(context).toMatchObject({
        anchorChatId: chatId,
        anchorExcerpt: null,
        anchorMessageId: null,
        firedAt: fire.fired_at.toISOString(),
        fireOrdinal: null,
        fireTotal: null,
        nextFireAt: null,
        repeat: null,
    });
    await expect(
        owner.trpc.reminder.runs.query({ reminderId: reminder.id, serverId })
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    await expect(owner.trpc.reminder.list.query({ serverId })).resolves.toEqual(
        expect.not.arrayContaining([expect.objectContaining({ id: reminder.id })])
    );
});

/** The Agent seeing a wake: the queued attention that blocks the sweep goes. */
async function handleWakes(reminderId: string, firedAt?: Date) {
    if (firedAt) {
        await harness.sql`
            delete from reminder_agent_attention
            where reminder_id = ${reminderId}
              and fire_id in (
                select id from reminder_fires
                where reminder_id = ${reminderId} and fired_at = ${firedAt}
              )
        `;
        return;
    }
    await harness.sql`delete from reminder_agent_attention where reminder_id = ${reminderId}`;
}

/** Schedules a reminder and fires it, settling it at `settledAt`. */
async function fireOneShot(commandId: string, settledAt: Date, options: { repeat?: string } = {}) {
    const fireAt = new Date(settledAt.getTime() - 60_000);
    const scheduled = await scheduleReminder(
        connection.db,
        agentId,
        {
            anchorChatId: chatId,
            anchorMessageId,
            commandId,
            fireAt,
            repeat: options.repeat,
            serverId,
            title: `Reminder ${commandId}`,
        },
        { now: () => new Date(fireAt.getTime() - 60_000) }
    );
    await tickReminders(connection.db, { now: () => settledAt });
    return scheduled.reminder;
}

function daysBeforeSweep(days: number) {
    return new Date(sweptAt.getTime() - days * 24 * 60 * 60 * 1000);
}

async function countRows(table: string, reminderId: string, column = 'reminder_id') {
    const rows = (await harness.sql.unsafe(
        `select count(*)::int as total from ${table} where ${column} = $1`,
        [reminderId]
    )) as { total: number }[];
    return rows[0].total;
}
