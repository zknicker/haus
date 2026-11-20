import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { scheduleReminder, tickReminders } from '../src/reminders/reminders.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import type { HausClient } from './haus-client.ts';

const fixture = agentCreationFixture();
const dmSecret = 'Salary bands for the offer: Ada 210k';
let runner: { token: string };
let bea: HausClient;
let connection: HausConnection;
let dmMessageId: string;
let taskChatId: string;
let taskKey: string;

async function agentPost(path: string, body: Record<string, unknown>) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as {
            code?: string;
            message?: string | { id: string };
            task?: { key: string };
        },
        status: response.status,
    };
}

beforeAll(async () => {
    const { owner, serverId } = fixture;
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    runner = await fixture.mintRunner('run_task_reminder_dm_origin');
    bea = await fixture.signIn('user_task_reminder_bea', ['bea-reminders@haus.test']);
    const { token } = await owner.trpc.invitation.create.mutate({
        email: 'bea-reminders@haus.test',
        serverId,
    });
    await bea.trpc.invitation.accept.mutate({ token });
    const dm = await owner.trpc.chat.send.mutate({
        agentId: fixture.orbitAgentId,
        content: dmSecret,
        nonce: 'task_reminder_dm_origin',
        serverId,
        targetKind: 'agent-dm',
    });
    dmMessageId = dm.message.id;
    const started = await agentPost('/api/agent/tasks/start', {
        from: dmMessageId,
        target: 'dm:@ada',
        title: 'Benchmark the offer',
    });
    taskKey = started.body.task?.key ?? '';
    taskChatId =
        (await owner.trpc.task.get.query({ key: taskKey, serverId })).chatId ?? 'missing task chat';
});

afterAll(async () => {
    bea?.close();
    await connection?.close();
});

test('a reminder on a DM-origin Task with no messages is refused, not anchored on the DM', async () => {
    const scheduled = await agentPost('/api/agent/reminders/schedule', {
        commandId: 'task-reminder-empty-dm-origin',
        fireAt: '2099-01-01T00:00:00.000Z',
        target: `task:${taskKey}`,
        title: 'Check the offer',
    });

    expect(scheduled).toEqual({
        body: {
            code: 'INVALID_ARG',
            message:
                'This Task has no messages yet, and a reminder on it anchors on one of its own. Post in the Task first.',
        },
        status: 409,
    });
    const [anchored] = (await fixture.harness.sql`
        select count(*)::int as total from reminders where anchor_message_id = ${dmMessageId}
    `) as { total: number }[];
    expect(anchored?.total).toBe(0);
});

test('the fire context never shows a DM anchor to a Task reader outside the DM', async () => {
    const { serverId } = fixture;
    const fireAt = new Date('2026-11-19T12:00:00.000Z');
    const legacy = await scheduleReminder(
        connection.db,
        fixture.orbitAgentId,
        {
            anchorChatId: taskChatId,
            anchorMessageId: dmMessageId,
            commandId: 'task-reminder-legacy-dm-anchor',
            fireAt,
            serverId,
            title: 'Check the offer',
        },
        { now: () => new Date(fireAt.getTime() - 60_000) }
    );
    await tickReminders(connection.db, { now: () => new Date(fireAt.getTime() + 1000) });
    const [fire] = (await fixture.harness.sql`
        select id from reminder_fires where reminder_id = ${legacy.reminder.id}
    `) as { id: string }[];
    const sent = await agentPost('/api/agent/messages/send', {
        cause: fire?.id,
        content: 'Checked the offer.',
        nonce: `task-reminder-answer-${fire?.id}`,
        target: `task:${taskKey}`,
    });
    const messageId = typeof sent.body.message === 'object' ? sent.body.message.id : '';

    expect(await bea.trpc.automation.fireContext.query({ messageId, serverId })).toMatchObject({
        anchorChatId: taskChatId,
        anchorExcerpt: null,
        anchorMessageId: null,
    });
    expect(
        await fixture.owner.trpc.automation.fireContext.query({ messageId, serverId })
    ).toMatchObject({ anchorExcerpt: dmSecret, anchorMessageId: dmMessageId });
});
