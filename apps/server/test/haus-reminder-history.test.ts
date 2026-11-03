import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { scheduleReminder, tickReminders } from '../src/reminders/reminders.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

/**
 * `reminder.history` is the Agent's fire log: one entry per fire, newest first,
 * so a recurring reminder appears once per wake. The whole fixture is fired
 * against a fixed clock in `beforeAll` and every test reads that one log.
 */

let agentId: string;
let anchorMessageId: string;
let answerChatId: string;
let answerMessageId: string;
let lateAnswerMessageId: string;
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let otherAgentId: string;
let otherReminderId: string;
let owner: HausClient;
let plainReminderId: string;
let recurringReminderId: string;
let scriptReminderId: string;
let serverId: string;

const base = new Date('2026-08-01T10:00:00.000Z');

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_history_owner'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reminder History Server',
        slug: 'reminder-history-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'History anchor',
        nonce: 'history-anchor',
        serverId,
    });
    anchorMessageId = anchor.message.id;
    agentId = 'agt_history_cove';
    otherAgentId = 'agt_history_moss';
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values
            (${agentId}, ${serverId}, 'history-cove', 'Cove', 'America/New_York'),
            (${otherAgentId}, ${serverId}, 'history-moss', 'Moss', 'America/New_York')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${agentId}), (${serverId}, ${chatId}, ${otherAgentId})
    `;

    // Fires, in order: the other Agent's reminder, a plain one-shot, a script
    // reminder, then two wakes of one recurring reminder.
    otherReminderId = await schedule(otherAgentId, {
        commandId: 'history-other',
        fireAt: hoursAfterBase(0),
        title: 'Moss checks the queue',
    });
    await tickReminders(connection.db, { now: () => hoursAfterBase(0) });
    plainReminderId = await schedule(agentId, {
        commandId: 'history-plain',
        fireAt: hoursAfterBase(1),
        title: 'Write the standup note',
    });
    await tickReminders(connection.db, { now: () => hoursAfterBase(1) });
    scriptReminderId = await schedule(agentId, {
        commandId: 'history-script',
        fireAt: hoursAfterBase(2),
        script: 'check-deploy.sh',
        title: 'Watch the deploy',
    });
    await tickReminders(connection.db, { now: () => hoursAfterBase(2) });
    recurringReminderId = await schedule(agentId, {
        commandId: 'history-recurring',
        fireAt: hoursAfterBase(3),
        repeat: 'every:1h',
        title: 'Sweep the inbox',
    });
    await tickReminders(connection.db, { now: () => hoursAfterBase(3) });
    await tickReminders(connection.db, { now: () => hoursAfterBase(4) });

    await harness.sql`
        update reminder_fires
        set script_exit_code = 2, script_timed_out = true
        where reminder_id = ${scriptReminderId}
    `;

    // Both reminders are edited after they fired, in opposite directions: the
    // script reminder loses its script and the plain one gains one. History
    // must still describe each fire the way it actually happened.
    await harness.sql`update reminders set script = null where id = ${scriptReminderId}`;
    await harness.sql`
        update reminders set script = 'added-later.sh' where id = ${plainReminderId}
    `;

    // The Agent answered the recurring reminder's first wake in another
    // Channel, so the entry's Chat can only come from the message row.
    const otherChannel = await owner.trpc.chat.createChannel.mutate({
        agentIds: [agentId],
        name: 'history-answers',
        serverId,
    });
    answerChatId = otherChannel.id;
    const answer = await owner.trpc.chat.send.mutate({
        chatId: answerChatId,
        content: 'Inbox is clear.',
        nonce: 'history-answer',
        serverId,
    });
    answerMessageId = answer.message.id;
    const firstRecurringFireId = await fireIdAt(recurringReminderId, hoursAfterBase(3));
    await harness.sql`
        insert into message_causes (
            anchor_chat_id, attribution, fired_at, kind, message_id, owner_agent_id,
            reminder_fire_id, reminder_id, server_id, summary, title
        )
        values (
            ${chatId}, 'explicit', ${hoursAfterBase(3)}, 'reminder_fire', ${answerMessageId},
            ${agentId}, ${firstRecurringFireId}, ${recurringReminderId}, ${serverId},
            'Every hour', 'Sweep the inbox'
        )
    `;

    // Nothing stops an Agent naming the same fire twice: `message_causes` keys
    // on the message, so one fire can carry two answers.
    const lateAnswer = await owner.trpc.chat.send.mutate({
        chatId: answerChatId,
        content: 'Following up on the inbox sweep.',
        nonce: 'history-answer-late',
        serverId,
    });
    lateAnswerMessageId = lateAnswer.message.id;
    await harness.sql`
        update chat_messages
        set created_at = created_at + interval '1 minute'
        where id = ${lateAnswerMessageId}
    `;
    await harness.sql`
        insert into message_causes (
            anchor_chat_id, attribution, fired_at, kind, message_id, owner_agent_id,
            reminder_fire_id, reminder_id, server_id, summary, title
        )
        values (
            ${chatId}, 'explicit', ${hoursAfterBase(3)}, 'reminder_fire', ${lateAnswerMessageId},
            ${agentId}, ${firstRecurringFireId}, ${recurringReminderId}, ${serverId},
            'Every hour', 'Sweep the inbox'
        )
    `;
});

afterAll(async () => {
    owner?.close();
    await connection?.close();
    await harness?.close();
});

test("logs every fire of the Agent's reminders, newest first", async () => {
    const history = await owner.trpc.reminder.history.query({ agentId, serverId });

    expect(
        history.map((entry) => ({ firedAt: entry.firedAt, reminderId: entry.reminderId }))
    ).toEqual([
        { firedAt: hoursAfterBase(4).toISOString(), reminderId: recurringReminderId },
        { firedAt: hoursAfterBase(3).toISOString(), reminderId: recurringReminderId },
        { firedAt: hoursAfterBase(2).toISOString(), reminderId: scriptReminderId },
        { firedAt: hoursAfterBase(1).toISOString(), reminderId: plainReminderId },
    ]);
    // The recurring reminder is one row with two wakes, and each wake is its
    // own entry carrying its own scheduled slot.
    const wakes = history.filter((entry) => entry.reminderId === recurringReminderId);
    expect(new Set(wakes.map((entry) => entry.fireId)).size).toBe(2);
    expect(wakes.map((entry) => entry.scheduledFor)).toEqual([
        hoursAfterBase(4).toISOString(),
        hoursAfterBase(3).toISOString(),
    ]);
    expect(wakes.every((entry) => entry.repeat === 'every:1h')).toBe(true);
    expect(history.at(-1)).toMatchObject({
        repeat: null,
        title: 'Write the standup note',
    });
});

test('carries the script result the fire itself recorded, not the reminder as it stands now', async () => {
    const history = await owner.trpc.reminder.history.query({ agentId, serverId });

    // The script was removed from the reminder after this fire ran it.
    expect(history.find((entry) => entry.reminderId === scriptReminderId)?.script).toEqual({
        exitCode: 2,
        timedOut: true,
    });
    // And added to the other reminder after this fire ran without one.
    expect(history.find((entry) => entry.reminderId === plainReminderId)?.script).toBeNull();
});

test("names the Agent's answer, in the Chat the answer was posted to", async () => {
    const history = await owner.trpc.reminder.history.query({ agentId, serverId });
    const wakes = history.filter((entry) => entry.reminderId === recurringReminderId);

    expect(wakes[1].answer).toEqual({ chatId: answerChatId, messageId: answerMessageId });
    expect(answerChatId).not.toBe(chatId);
    expect(wakes[0].answer).toBeNull();
    expect(history.find((entry) => entry.reminderId === plainReminderId)?.answer).toBeNull();
});

test('keeps a twice-answered fire to one entry, naming the earlier answer', async () => {
    const history = await owner.trpc.reminder.history.query({ agentId, serverId });
    const twiceAnswered = history.filter(
        (entry) => entry.scheduledFor === hoursAfterBase(3).toISOString()
    );

    expect(twiceAnswered).toHaveLength(1);
    expect(twiceAnswered[0].answer).toEqual({
        chatId: answerChatId,
        messageId: answerMessageId,
    });
    expect(answerMessageId).not.toBe(lateAnswerMessageId);
});

test("excludes another Agent's reminders", async () => {
    const mine = await owner.trpc.reminder.history.query({ agentId, serverId });
    const theirs = await owner.trpc.reminder.history.query({ agentId: otherAgentId, serverId });

    expect(mine.map((entry) => entry.reminderId)).not.toContain(otherReminderId);
    expect(theirs.map((entry) => entry.reminderId)).toEqual([otherReminderId]);
});

test('honors the requested limit, keeping the newest fires', async () => {
    const history = await owner.trpc.reminder.history.query({ agentId, limit: 2, serverId });

    expect(history.map((entry) => entry.firedAt)).toEqual([
        hoursAfterBase(4).toISOString(),
        hoursAfterBase(3).toISOString(),
    ]);
});

async function schedule(
    ownerAgentId: string,
    input: {
        commandId: string;
        fireAt: Date;
        repeat?: string;
        script?: string;
        title: string;
    }
) {
    const scheduled = await scheduleReminder(
        connection.db,
        ownerAgentId,
        {
            anchorChatId: chatId,
            anchorMessageId,
            commandId: input.commandId,
            fireAt: input.fireAt,
            repeat: input.repeat,
            script: input.script,
            serverId,
            title: input.title,
        },
        { now: () => new Date(input.fireAt.getTime() - 60_000) }
    );
    return scheduled.reminder.id;
}

async function fireIdAt(reminderId: string, firedAt: Date) {
    const [fire] = (await harness.sql`
        select id from reminder_fires
        where reminder_id = ${reminderId} and fired_at = ${firedAt}
    `) as { id: string }[];
    return fire.id;
}

function hoursAfterBase(hours: number) {
    return new Date(base.getTime() + hours * 60 * 60 * 1000);
}
