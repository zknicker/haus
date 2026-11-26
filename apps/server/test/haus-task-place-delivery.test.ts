import { afterAll, beforeAll, expect, test } from 'bun:test';
import { targetForChat } from '../src/agent-api/message-view.ts';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { buildInboxItems } from '../src/agent-delivery/inbox-items.ts';
import { listInboxItemsByDedupeKeys } from '../src/agent-delivery/store.ts';
import { inferMessageCause } from '../src/automations/infer-message-cause.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { tickReminders } from '../src/reminders/scheduler.ts';
import { createHomedAgent } from './agent-home.fixture.ts';
import { startTestTask } from './task-place-fixture.ts';
import { workerLinkHelpers } from './worker-link-helpers.ts';
import { workerRecordFixture } from './worker-record-fixture.ts';

const fixture = workerRecordFixture();
const { agentPost } = workerLinkHelpers(fixture);
let connection: HausConnection;
let novaId: string;
let target: string;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    target = `task:${fixture.task.shortId}`;
    novaId = (
        await createHomedAgent(fixture.owner, {
            computerId: fixture.computerId,
            displayName: 'Nova',
            handle: 'nova',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId: fixture.serverId,
        })
    ).agent.id;
});

afterAll(async () => {
    await connection?.close();
});

test('task: resolves for send and read; an unknown short id is refused', async () => {
    const runner = await fixture.mintRunner('run_task_target');
    const sent = await agentPost(runner, '/api/agent/messages/send', {
        content: 'Starting on the flaky test.',
        nonce: 'task-target-send',
        target,
    });
    expect(sent.status).toBe(200);
    expect(await messageChat('task-target-send')).toBe(fixture.task.chatId);

    const history = await fetch(
        new URL(`/api/agent/history?target=${encodeURIComponent(target)}`, fixture.harness.url),
        { headers: { authorization: `Bearer ${runner.token}` } }
    );
    expect(history.status).toBe(200);
    const { messages } = (await history.json()) as { messages: { chat_id: string }[] };
    expect(messages.map((message) => message.chat_id)).toContain(fixture.task.chatId);
    expect(await targetForChat(connection.db, fixture.serverId, fixture.task.chatId)).toBe(target);

    const unknown = await agentPost(runner, '/api/agent/messages/send', {
        content: 'Nowhere.',
        nonce: 'task-target-unknown',
        target: 'task:zzzzzzzz',
    });
    expect(unknown).toMatchObject({ body: { code: 'INVALID_TARGET' }, status: 404 });
});

test('a Task delivers to its followers and mentions', async () => {
    const runner = await fixture.mintRunner('run_task_recipients');
    await fixture.readTarget(runner, target);
    const send = (content: string, nonce: string) =>
        agentPost(runner, '/api/agent/messages/send', { content, nonce, target });

    expect((await send('Quiet progress note.', 'task-quiet')).status).toBe(200);
    expect(await novaItems()).toEqual([]);

    expect((await send('@nova can you check the retry path?', 'task-mention')).status).toBe(200);
    expect(await novaItems()).toEqual([{ chat_id: fixture.task.chatId, mentioned: true }]);
    const [follow] = (await fixture.harness.sql`
        select followed, task_chat_kind from agent_task_follows
        where agent_id = ${novaId} and task_chat_id = ${fixture.task.chatId}
    `) as { followed: boolean; task_chat_kind: string }[];
    expect(follow).toEqual({ followed: true, task_chat_kind: 'task' });

    expect((await send('Retry path fixed.', 'task-followed')).status).toBe(200);
    expect(await novaItems()).toHaveLength(2);
    expect(await itemTargets(novaId, 'run_task_nova')).toEqual([target, target]);
});

test('a reminder set on a Task anchors on its newest message and reports to the Task', async () => {
    const runner = await fixture.mintRunner('run_task_reminder');
    const fireAt = new Date(Date.now() + 3_600_000);
    const scheduled = await agentPost(runner, '/api/agent/reminders/schedule', {
        commandId: 'task-reminder-once',
        fireAt: fireAt.toISOString(),
        target,
        title: 'Check the flaky test again',
    });
    expect(scheduled).toMatchObject({ body: { reminder: { anchorTarget: target } }, status: 200 });
    const [reminder] = (await fixture.harness.sql`
        select anchor_chat_id, anchor_message_id from reminders where title = 'Check the flaky test again'
    `) as { anchor_chat_id: string; anchor_message_id: string }[];
    expect(reminder).toEqual({
        anchor_chat_id: fixture.task.chatId,
        anchor_message_id: await messageId('task-followed'),
    });

    const delivery = new AgentDelivery(connection.db, { isOnline: () => false, send: () => false });
    await tickReminders(connection.db, { now: () => new Date(fireAt.getTime() + 1000) }, delivery);
    const [fire] = (await fixture.harness.sql`
        select chat_id, dedupe_key from agent_inbox
        where agent_id = ${fixture.orbitAgentId} and source = 'reminder'
    `) as { chat_id: string; dedupe_key: string }[];
    expect(fire?.chat_id).toBe(fixture.task.chatId);

    await fixture.harness.sql`
        update agent_inbox set served_at = now(), run_id = 'run_task_fire'
        where dedupe_key = ${fire?.dedupe_key ?? ''}
    `;
    const cause = await inferMessageCause(connection.db, {
        agentId: fixture.orbitAgentId,
        chatId: fixture.task.chatId,
        runId: 'run_task_fire',
        serverId: fixture.serverId,
    });
    expect(cause).toMatchObject({ attribution: 'inferred' });
    expect(await itemTargets(fixture.orbitAgentId, 'run_task_fire')).toEqual([target]);
    expect(
        await inferMessageCause(connection.db, {
            agentId: fixture.orbitAgentId,
            chatId: fixture.channelId,
            runId: 'run_task_fire',
            serverId: fixture.serverId,
        })
    ).toBeUndefined();
});

test('a recurring reminder on a Task is refused; one-time is the only kind', async () => {
    const runner = await fixture.mintRunner('run_task_recurring');
    const refused = await agentPost(runner, '/api/agent/reminders/schedule', {
        commandId: 'task-reminder-daily',
        messageId: await messageId('task-target-send'),
        repeat: 'daily at 09:00',
        title: 'Daily flaky test check',
    });
    expect(refused).toMatchObject({ body: { code: 'TASK_RECURRING_REMINDER' }, status: 400 });
    const byTarget = await agentPost(runner, '/api/agent/reminders/schedule', {
        commandId: 'task-reminder-daily-target',
        repeat: 'daily at 09:00',
        target,
        title: 'Daily flaky test check',
    });
    expect(byTarget).toMatchObject({ body: { code: 'TASK_RECURRING_REMINDER' }, status: 400 });
});

test('a reminder on a Task with no posts is refused until someone posts in the Task', async () => {
    const empty = await startTestTask(fixture.harness, fixture.owner, {
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        title: 'Not started yet',
    });
    const runner = await fixture.mintRunner('run_task_reminder_empty');
    const schedule = (commandId: string) =>
        agentPost(runner, '/api/agent/reminders/schedule', {
            commandId,
            fireAt: new Date(Date.now() + 7_200_000).toISOString(),
            target: `task:${empty.shortId}`,
            title: 'Check back on the empty Task',
        });
    expect(await schedule('task-reminder-empty')).toMatchObject({
        body: { code: 'INVALID_ARG', message: expect.stringContaining('Post in the Task first.') },
        status: 409,
    });

    const posted = await agentPost(runner, '/api/agent/messages/send', {
        content: 'Picking this up.',
        nonce: 'task-reminder-empty-post',
        target: `task:${empty.shortId}`,
    });
    expect(posted.status).toBe(200);
    expect(await schedule('task-reminder-empty-posted')).toMatchObject({
        body: { reminder: { anchorTarget: `task:${empty.shortId}` } },
        status: 200,
    });
    expect(
        await fixture.harness.sql`
            select anchor_chat_id, anchor_message_id from reminders
            where title = 'Check back on the empty Task'
        `
    ).toEqual([
        {
            anchor_chat_id: empty.chatId,
            anchor_message_id: await messageId('task-reminder-empty-post'),
        },
    ]);
});

test('archiving a Task cancels a pending reminder on it', async () => {
    const task = await startTestTask(fixture.harness, fixture.owner, {
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        title: 'Closes with a reminder',
    });
    const runner = await fixture.mintRunner('run_task_reminder_close');
    await agentPost(runner, '/api/agent/messages/send', {
        content: 'Watching this one.',
        nonce: 'task-reminder-close-post',
        target: `task:${task.shortId}`,
    });
    const scheduled = await agentPost(runner, '/api/agent/reminders/schedule', {
        commandId: 'task-reminder-close',
        fireAt: new Date(Date.now() + 3_600_000).toISOString(),
        target: `task:${task.shortId}`,
        title: 'Canceled by archiving',
    });
    expect(scheduled.status).toBe(200);
    const closed = await agentPost(runner, '/api/agent/tasks/archive', {
        task: task.shortId,
    });
    expect(closed.status).toBe(200);
    expect(
        await fixture.harness
            .sql`select status from reminders where title = 'Canceled by archiving'`
    ).toEqual([{ status: 'canceled' }]);
});

test('a Task takes inline replies from Agents and people, like a Channel', async () => {
    const runner = await fixture.mintRunner('run_task_inline_reply');
    const parentId = await messageId('task-target-send');
    const agentReply = await agentPost(runner, '/api/agent/messages/send', {
        content: 'Replying inline inside the Task.',
        nonce: 'task-inline-agent',
        replyToMessageId: parentId,
        target,
    });
    expect(agentReply.status).toBe(200);
    const human = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.task.chatId,
        content: 'And a person replies to that reply.',
        nonce: 'task-inline-human',
        replyToMessageId: await messageId('task-inline-agent'),
        serverId: fixture.serverId,
    });
    expect(human.message.reply).toMatchObject({
        parentMessageId: await messageId('task-inline-agent'),
        rootMessageId: parentId,
    });
    expect(
        await fixture.harness.sql`
            select chat_id, reply_to_message_id, reply_root_message_id from chat_messages
            where nonce = 'task-inline-agent'
        `
    ).toEqual([
        {
            chat_id: fixture.task.chatId,
            reply_root_message_id: parentId,
            reply_to_message_id: parentId,
        },
    ]);
});

async function itemTargets(agentId: string, runId: string) {
    const rows = (await fixture.harness.sql`
        update agent_inbox set run_id = ${runId}
        where agent_id = ${agentId} and chat_id = ${fixture.task.chatId}
            and (run_id is null or run_id = ${runId})
        returning dedupe_key
    `) as { dedupe_key: string }[];
    const items = await listInboxItemsByDedupeKeys(connection.db, {
        agentId,
        dedupeKeys: rows.map((row) => row.dedupe_key),
        runId,
    });
    return (await buildInboxItems(connection.db, items)).map((item) => item.target);
}

async function messageChat(nonce: string) {
    const [row] = (await fixture.harness.sql`
        select chat_id from chat_messages where nonce = ${nonce}
    `) as { chat_id: string }[];
    return row?.chat_id;
}

async function messageId(nonce: string) {
    const [row] = (await fixture.harness.sql`
        select id from chat_messages where nonce = ${nonce}
    `) as { id: string }[];
    return row?.id ?? '';
}

async function novaItems() {
    return (await fixture.harness.sql`
        select chat_id, mentioned from agent_inbox
        where agent_id = ${novaId} and chat_id = ${fixture.task.chatId}
        order by created_at
    `) as { chat_id: string; mentioned: boolean }[];
}
