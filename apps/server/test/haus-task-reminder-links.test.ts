import { afterAll, beforeAll, expect, test } from 'bun:test';
import { taskUpdatedTopic } from '../src/realtime/topics.ts';
import { cancelOperatorReminder } from '../src/reminders/operator-reminders.ts';
import { cancelReminder, scheduleReminder, tickReminders } from '../src/reminders/reminders.ts';
import { snoozeReminder, updateReminder } from '../src/reminders/reschedule.ts';
import { deleteExpiredReminderHistory } from '../src/reminders/retention-sweep.ts';
import { getTask } from '../src/tasks/task-list.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { captureTopic, settleRealtime, type TopicCapture } from './realtime-capture.ts';

/** A Task's Reminders: who may read them, and how an open Task hears they changed. */
const clock = { now: () => new Date() };
const later = () => new Date(Date.now() + 3_600_000);
let fixture: NotificationFixture;
let boardId: string;
let updates: TopicCapture<{ taskId: string; version: number }>;
let commands = 0;

beforeAll(async () => {
    fixture = await startNotificationFixture();
    const [general] = await fixture.owner.trpc.board.list.query({ serverId: fixture.serverId });
    boardId = general?.id ?? '';
    updates = captureTopic(taskUpdatedTopic);
});

afterAll(async () => {
    updates?.stop();
    await fixture.close();
});

async function createTask(title: string) {
    const { owner, serverId } = fixture;
    return (await owner.trpc.task.create.mutate({ boardId, serverId, title })).task;
}

/** An Agent's Reminder on a fresh message in `chatId`, describing `description`. */
async function schedule(agentId: string, chatId: string, description: string) {
    const { owner, serverId } = fixture;
    commands += 1;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Anchor',
        nonce: `reminder-links-${commands}`,
        serverId,
    });
    const { reminder } = await scheduleReminder(
        fixture.database.db,
        agentId,
        {
            anchorChatId: chatId,
            anchorMessageId: anchor.message.id,
            commandId: `reminder-links-${commands}`,
            description,
            fireAt: later(),
            serverId,
            title: 'Follow up',
        },
        clock
    );
    return reminder;
}

function command(reminder: { id: string; version: number }) {
    commands += 1;
    return {
        commandId: `reminder-links-${commands}`,
        expectedVersion: reminder.version,
        reminderId: reminder.id,
        serverId: fixture.serverId,
    };
}

/** The Tasks `run` announced, with each event's version. */
async function announced(run: () => Promise<unknown>) {
    await settleRealtime();
    const seen = updates.events.length;
    await run();
    await settleRealtime();
    return updates.events.slice(seen).map(({ taskId, version }) => ({ taskId, version }));
}

test('a Reminder anchored in a DM stays out of the Task for anyone who cannot read that DM', async () => {
    const { orbitAgentId, owner, peer, scoutAgentId, serverId } = fixture;
    const task = await createTask('Shared Task');
    const dm = await owner.trpc.chat.ensureAgentDm.mutate({ agentId: orbitAgentId, serverId });
    const reminder = await schedule(orbitAgentId, dm.id, `Private note on ${task.key}`);

    const input = { serverId, taskId: task.id };
    const owners = await owner.trpc.task.get.query(input);
    expect(owners.reminders.map((row) => row.reminderId)).toEqual([reminder.id]);
    expect((await peer.trpc.task.get.query(input)).reminders).toEqual([]);

    const asAgent = (agentId: string) =>
        getTask(fixture.database.db, { agentId, kind: 'agent' }, input);
    expect((await asAgent(orbitAgentId)).reminders).toHaveLength(1);
    expect((await asAgent(scoutAgentId)).reminders).toEqual([]);
});

test('a Reminder in a Channel reaches its members, and leaves with a deleted Channel', async () => {
    const { createChannel, orbitAgentId, owner, peer, serverId } = fixture;
    const task = await createTask('Channel Task');
    const name = 'reminder-links-channel';
    const channelId = await createChannel(name);
    const reminder = await schedule(orbitAgentId, channelId, `Check ${task.key}`);
    const input = { serverId, taskId: task.id };
    const read = await peer.trpc.task.get.query(input);
    expect(read.reminders.map((row) => row.reminderId)).toEqual([reminder.id]);

    const events = await announced(() =>
        owner.trpc.chat.deleteChannel.mutate({ chatId: channelId, confirmation: name, serverId })
    );
    expect((await owner.trpc.task.get.query(input)).reminders).toEqual([]);
    expect(events).toContainEqual({ taskId: task.id, version: task.version });
});

test('scheduling, editing, snoozing, and canceling announce every Task they touched', async () => {
    const { createChannel, orbitAgentId } = fixture;
    const { db } = fixture.database;
    const first = await createTask('First');
    const second = await createTask('Second');
    const channelId = await createChannel('reminder-links-events');
    const version = {
        first: { taskId: first.id, version: 1 },
        second: { taskId: second.id, version: 1 },
    };

    let reminder: Awaited<ReturnType<typeof schedule>> | undefined;
    expect(
        await announced(async () => {
            reminder = await schedule(orbitAgentId, channelId, `Check ${first.key}`);
        })
    ).toEqual([version.first]);
    if (!reminder) {
        throw new Error('Expected a Reminder.');
    }

    // Moving the reference announces the Task it left and the one it reached.
    const moved = await announced(async () => {
        reminder = (
            await updateReminder(
                db,
                orbitAgentId,
                { ...command(reminder as never), description: `Check ${second.key}` },
                clock
            )
        ).reminder;
    });
    expect(moved).toHaveLength(2);
    expect(moved).toEqual(expect.arrayContaining([version.first, version.second]));

    expect(
        await announced(async () => {
            reminder = (
                await snoozeReminder(
                    db,
                    orbitAgentId,
                    { ...command(reminder as never), duration: '1h' },
                    clock
                )
            ).reminder;
        })
    ).toEqual([version.second]);

    expect(
        await announced(() => cancelReminder(db, orbitAgentId, command(reminder as never), clock))
    ).toEqual([version.second]);
});

test('an operator cancel, a fire, and a retention sweep announce the Task too', async () => {
    const { createChannel, orbitAgentId, ownerUserId, serverId } = fixture;
    const { db } = fixture.database;
    const task = await createTask('Scheduled');
    const expected = [{ taskId: task.id, version: task.version }];
    const channelId = await createChannel('reminder-links-settle');

    const canceled = await schedule(orbitAgentId, channelId, `Cancel ${task.key}`);
    const operator = await findUserById(db, ownerUserId);
    expect(
        await announced(() => cancelOperatorReminder(db, operator, command(canceled), clock))
    ).toEqual(expected);

    const fired = await schedule(orbitAgentId, channelId, `Fire ${task.key}`);
    const fireClock = { now: () => new Date(Date.now() + 2 * 3_600_000) };
    // Earlier tests' Reminders are due at this clock too.
    expect(await announced(() => tickReminders(db, fireClock))).toContainEqual(expected[0]);
    const detail = await fixture.owner.trpc.task.get.query({ serverId, taskId: task.id });
    expect(detail.reminders.find((row) => row.reminderId === fired.id)?.nextFireAt).toBeNull();

    const swept = await announced(() =>
        deleteExpiredReminderHistory(db, new Date(Date.now() + 366 * 86_400_000))
    );
    expect(swept).toContainEqual(expected[0]);
});

test('deleting an Agent cancels its Reminders and announces their Tasks', async () => {
    const { createChannel, owner, scoutAgentId, serverId } = fixture;
    const task = await createTask('Orphaned');
    const channelId = await createChannel('reminder-links-agent');
    await schedule(scoutAgentId, channelId, `Check ${task.key}`);

    expect(
        await announced(() =>
            owner.trpc.agent.delete.mutate({
                agentId: scoutAgentId,
                confirmation: 'Scout',
                serverId,
            })
        )
    ).toEqual([{ taskId: task.id, version: task.version }]);
    const detail = await owner.trpc.task.get.query({ serverId, taskId: task.id });
    expect(detail.reminders[0]?.nextFireAt).toBeNull();
});
