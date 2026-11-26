import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
    formatAgentReferenceTarget,
    formatChatMessageReferenceTarget,
    formatChatReferenceTarget,
} from '@haus/api';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { scheduleReminder } from '../src/reminders/reminders.ts';
import { updateReminder } from '../src/reminders/reschedule.ts';
import { testSqlAgentHome } from './agent-home.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';

const agentId = 'agt_task_refs';
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let audit: TestTask;
let gen: TestTask;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await createHausClient(harness, await harness.humans.mintSessionToken('user_refs'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task References',
        slug: 'task-references',
    });
    serverId = server.id;
    chatId = server.channels[0]?.id ?? '';
    await harness.sql`
        insert into agents (id, server_id, handle, display_name, home_timezone, home_project_id)
        values (${agentId}, ${serverId}, 'refs-cove', 'Cove', 'America/New_York', ${await testSqlAgentHome(harness.sql, serverId)})
    `;
    audit = await start('Audit');
    gen = await start('Gen');
});

function start(title: string) {
    return startTestTask(harness, owner, { channelId: chatId, serverId, title });
}

function link(task: TestTask, label = 'the work') {
    return `[${label}](task://${task.id})`;
}

afterAll(async () => {
    owner?.close();
    await connection?.close();
    await harness?.close();
});

describe('description references', () => {
    test('task.get resolves a description like an Agent message, when read', async () => {
        const anchor = await owner.trpc.chat.send.mutate({
            chatId,
            content: 'Message anchor for a description',
            nonce: 'refs-description-anchor',
            serverId,
        });
        const [channel] = (await harness.sql`
            select name from chats where id = ${chatId}
        `) as { name: string }[];
        const channelName = channel?.name ?? '';
        const shortId = anchor.message.id.slice(4, 12);
        const description = [
            `Seen in #${channelName}:${shortId}, see ${link(audit)} with @refs-cove.`,
            'Not GEN-1, an Issue code; merchbase-fulfillment PR 29 (d66f487) stays text.',
        ].join('\n');
        const started = await start('Described');
        const { task } = await owner.trpc.task.update.mutate({
            expectedVersion: 1,
            patch: { description },
            serverId,
            taskId: started.id,
        });

        const detail = await owner.trpc.task.get.query({ serverId, taskId: task.id });
        expect(detail.description).toBe(description);
        expect(detail.descriptionContent).toBe(
            [
                `Seen in [#${channelName} message](${formatChatMessageReferenceTarget(chatId, anchor.message.id)}), see ${link(audit)} with [@refs-cove](${formatAgentReferenceTarget(agentId)}).`,
                'Not GEN-1, an Issue code; merchbase-fulfillment PR 29 (d66f487) stays text.',
            ].join('\n')
        );
        expect(detail.descriptionTaskLinks).toEqual([
            { shortId: audit.shortId, taskId: audit.id, text: link(audit) },
        ]);

        // Read time, not write time: an edit resolves on the next read with no bookkeeping.
        await owner.trpc.task.update.mutate({
            expectedVersion: task.version,
            patch: { description: `Now ${link(gen)} in #${channelName}` },
            serverId,
            taskId: task.id,
        });
        const edited = await owner.trpc.task.get.query({ serverId, taskId: task.id });
        expect(edited.descriptionContent).toBe(
            `Now ${link(gen)} in [#${channelName}](${formatChatReferenceTarget(chatId)})`
        );
        expect(edited.descriptionTaskLinks).toEqual([
            { shortId: gen.shortId, taskId: gen.id, text: link(gen) },
        ]);
        // A description names a Task; it is not one of its Mentioned in.
        expect((await owner.trpc.task.get.query({ serverId, taskId: gen.id })).mentions).toEqual(
            []
        );
    });
});

describe('message references', () => {
    test('records task links, skipping code, unknown Tasks and bare codes', async () => {
        const content = [
            `Picking up ${link(audit, 'the audit')} and ${link(gen, 'the general one')}.`,
            `Not \`${link(audit)}\` in code, not GEN-1, and not [x](task://tsk_missing).`,
            '```',
            link(audit),
            '```',
        ].join('\n');
        const sent = await owner.trpc.chat.send.mutate({
            chatId,
            content,
            nonce: 'refs-both-forms',
            serverId,
        });
        const expected = [
            { shortId: audit.shortId, taskId: audit.id, text: link(audit, 'the audit') },
            { shortId: gen.shortId, taskId: gen.id, text: link(gen, 'the general one') },
        ];
        expect(sent.message.content).toBe(content);
        expect(sent.message.taskLinks).toEqual(expected);

        const page = await owner.trpc.chat.messages.query({ chatId, serverId });
        expect(page.messages.find((message) => message.id === sent.message.id)?.taskLinks).toEqual(
            expected
        );
        const detail = await owner.trpc.task.get.query({ serverId, taskId: audit.id });
        expect(detail.mentions).toEqual([
            expect.objectContaining({
                authorLabel: expect.any(String),
                chatId,
                messageId: sent.message.id,
                place: {
                    chatId,
                    chatKind: 'channel',
                    chatName: expect.any(String),
                },
            }),
        ]);
    });

    test('a link reads the Task short id when read', async () => {
        const sent = await owner.trpc.chat.send.mutate({
            chatId,
            content: `${link(audit)} again`,
            nonce: 'refs-again',
            serverId,
        });
        const page = await owner.trpc.chat.messages.query({ chatId, serverId });
        expect(page.messages.find((message) => message.id === sent.message.id)?.taskLinks).toEqual([
            { shortId: audit.shortId, taskId: audit.id, text: link(audit) },
        ]);
        const detail = await owner.trpc.task.get.query({ serverId, shortId: audit.shortId });
        expect(detail.mentions.map((mention) => mention.messageId)[0]).toBe(sent.message.id);
    });
});

describe('reminder references', () => {
    test('records Task references on Reminder create and update', async () => {
        const anchor = await owner.trpc.chat.send.mutate({
            chatId,
            content: 'Reminder anchor',
            nonce: 'refs-reminder-anchor',
            serverId,
        });
        const clock = { now: () => new Date('2026-07-27T12:00:00.000Z') };
        const scheduled = await scheduleReminder(
            connection.db,
            agentId,
            {
                anchorChatId: chatId,
                anchorMessageId: anchor.message.id,
                commandId: 'refs-reminder',
                description: `Check ${link(gen)} and \`${link(gen)}\` Friday`,
                fireAt: new Date('2026-07-31T14:00:00.000Z'),
                serverId,
                title: 'Follow up',
            },
            clock
        );
        const linked = await owner.trpc.task.get.query({ serverId, taskId: gen.id });
        expect(linked.reminders).toEqual([
            {
                anchorChatId: chatId,
                kind: 'once',
                nextFireAt: '2026-07-31T14:00:00.000Z',
                reminderId: scheduled.reminder.id,
                setBy: { agentId, displayName: 'Cove' },
                title: 'Follow up',
            },
        ]);

        await updateReminder(
            connection.db,
            agentId,
            {
                commandId: 'refs-reminder-update',
                description: `Check ${link(audit)} instead`,
                expectedVersion: scheduled.reminder.version,
                reminderId: scheduled.reminder.id,
                serverId,
            },
            clock
        );
        expect((await owner.trpc.task.get.query({ serverId, taskId: gen.id })).reminders).toEqual(
            []
        );
        expect(
            (await owner.trpc.task.get.query({ serverId, taskId: audit.id })).reminders.map(
                (reminder) => reminder.reminderId
            )
        ).toEqual([scheduled.reminder.id]);
    });
});

describe('Task events', () => {
    test('archive and unarchive publish task.updated at each version', async () => {
        const task = await start('Evented');
        const realtime = captureAllTopics();
        await owner.trpc.task.archive.mutate({ expectedVersion: 1, serverId, taskId: task.id });
        await owner.trpc.task.unarchive.mutate({ expectedVersion: 2, serverId, taskId: task.id });
        const published = await publishedSince(realtime, serverId);
        expect(
            published
                .filter((event) => event.taskId === task.id && event.type === 'task.updated')
                .map(({ type, version }) => ({ type, version }))
        ).toEqual([
            { type: 'task.updated', version: 2 },
            { type: 'task.updated', version: 3 },
        ]);
        expect(published.some((event) => event.type === 'task.assigned')).toBe(false);
        realtime.stop();
    });
});
