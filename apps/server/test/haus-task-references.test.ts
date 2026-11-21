import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
    formatAgentReferenceTarget,
    formatChatMessageReferenceTarget,
    formatChatReferenceTarget,
} from '@haus/api';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { scheduleReminder } from '../src/reminders/reminders.ts';
import { updateReminder } from '../src/reminders/reschedule.ts';
import { assignTask } from '../src/tasks/task-assign.ts';
import { testSqlAgentHome } from './agent-home.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';
import { startTestTask } from './task-place-fixture.ts';

const agentId = 'agt_task_refs';
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let sec1: { id: string; key: string };
let gen1: { id: string; key: string };

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
    await owner.trpc.project.create.mutate({ key: 'SEC', name: 'security', serverId });
    sec1 = await start('Audit', 'SEC');
    gen1 = await start('Gen');
});

function start(title: string, key?: string) {
    return startTestTask(harness, owner, {
        channelId: chatId,
        serverId,
        title,
        ...(key ? { key } : {}),
    });
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
            `Seen in #${channelName}:${shortId}, see SEC-1 with @refs-cove.`,
            'Not `SEC-1` in code; merchbase-fulfillment PR 29 (d66f487) stays text.',
        ].join('\n');
        const started = await start('Described', 'SEC');
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
                `Seen in [#${channelName} message](${formatChatMessageReferenceTarget(chatId, anchor.message.id)}), see SEC-1 with [@refs-cove](${formatAgentReferenceTarget(agentId)}).`,
                'Not `SEC-1` in code; merchbase-fulfillment PR 29 (d66f487) stays text.',
            ].join('\n')
        );
        expect(detail.descriptionTaskLinks).toEqual([
            { key: 'SEC-1', taskId: sec1.id, text: 'SEC-1' },
        ]);

        // Read time, not write time: an edit resolves on the next read with no bookkeeping.
        await owner.trpc.task.update.mutate({
            expectedVersion: task.version,
            patch: { description: `Now ${gen1.key} in #${channelName}` },
            serverId,
            taskId: task.id,
        });
        const edited = await owner.trpc.task.get.query({ serverId, taskId: task.id });
        expect(edited.descriptionContent).toBe(
            `Now ${gen1.key} in [#${channelName}](${formatChatReferenceTarget(chatId)})`
        );
        expect(edited.descriptionTaskLinks).toEqual([
            { key: gen1.key, taskId: gen1.id, text: gen1.key },
        ]);
        // A description names a Task; it is not one of its Mentioned in.
        expect((await owner.trpc.task.get.query({ serverId, taskId: gen1.id })).mentions).toEqual(
            []
        );
    });
});

describe('message references', () => {
    test('records bare keys and task links, skipping code and unknown keys', async () => {
        const content = [
            `Picking up SEC-1 and [the general one](task://${gen1.id}).`,
            'Not `SEC-1` in code, not SEC-99, not sec-1, and not [x](task://tsk_missing).',
            '```',
            'SEC-1',
            '```',
        ].join('\n');
        const sent = await owner.trpc.chat.send.mutate({
            chatId,
            content,
            nonce: 'refs-both-forms',
            serverId,
        });
        const expected = [
            { key: 'SEC-1', taskId: sec1.id, text: 'SEC-1' },
            { key: gen1.key, taskId: gen1.id, text: `[the general one](task://${gen1.id})` },
        ];
        expect(sent.message.content).toBe(content);
        expect(sent.message.taskLinks).toEqual(expected);

        const page = await owner.trpc.chat.messages.query({ chatId, serverId });
        expect(page.messages.find((message) => message.id === sent.message.id)?.taskLinks).toEqual(
            expected
        );
        const detail = await owner.trpc.task.get.query({ serverId, taskId: sec1.id });
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

    test('a link reads the Task key from the ledger entry', async () => {
        const sent = await owner.trpc.chat.send.mutate({
            chatId,
            content: 'SEC-1 again',
            nonce: 'refs-again',
            serverId,
        });
        const page = await owner.trpc.chat.messages.query({ chatId, serverId });
        expect(page.messages.find((message) => message.id === sent.message.id)?.taskLinks).toEqual([
            { key: 'SEC-1', taskId: sec1.id, text: 'SEC-1' },
        ]);
        const detail = await owner.trpc.task.get.query({ key: 'SEC-1', serverId });
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
                description: `Check ${gen1.key} and \`${gen1.key}\` Friday`,
                fireAt: new Date('2026-07-31T14:00:00.000Z'),
                serverId,
                title: 'Follow up',
            },
            clock
        );
        const linked = await owner.trpc.task.get.query({ serverId, taskId: gen1.id });
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
                description: 'Check SEC-1 instead',
                expectedVersion: scheduled.reminder.version,
                reminderId: scheduled.reminder.id,
                serverId,
            },
            clock
        );
        expect((await owner.trpc.task.get.query({ serverId, taskId: gen1.id })).reminders).toEqual(
            []
        );
        expect(
            (await owner.trpc.task.get.query({ serverId, taskId: sec1.id })).reminders.map(
                (reminder) => reminder.reminderId
            )
        ).toEqual([scheduled.reminder.id]);
    });
});

describe('Task events', () => {
    test('publishes task events to everyone and the assignment fact to the assignee only', async () => {
        const [userRow] = (await harness.sql`
            select id from users where auth_subject = 'user_refs'
        `) as { id: string }[];
        const task = await start('Evented', 'SEC');
        const realtime = captureAllTopics();
        await owner.trpc.task.assign.mutate({
            assignee: { agentId, kind: 'agent' },
            expectedVersion: 1,
            serverId,
            taskId: task.id,
        });
        await owner.trpc.task.assign.mutate({
            assignee: null,
            expectedVersion: 2,
            serverId,
            taskId: task.id,
        });
        const published = await publishedSince(realtime, serverId);
        expect(
            published
                .filter((event) => event.taskId === task.id && event.type === 'task.updated')
                .map(({ type, version }) => ({ type, version }))
        ).toEqual([
            { type: 'task.updated', version: 2 },
            { type: 'task.updated', version: 3 },
        ]);
        realtime.stop();

        const userId = userRow?.id ?? '';
        const result = await assignTask(
            connection.db,
            { agentId, kind: 'agent' },
            { enqueue: () => Promise.resolve() },
            { assignee: { kind: 'user', userId }, expectedVersion: 3, serverId, taskId: task.id }
        );
        expect(result.assignmentChange).toMatchObject({
            actor: { agentId, kind: 'agent' },
            next: { kind: 'user', userId },
            previous: null,
        });
        expect(
            result.events
                .filter((event) => event.topic === 'task.assigned')
                .map((event) => event.delivery.audienceUserId)
        ).toEqual([userId]);
    });
});
