import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { scheduleReminder } from '../src/reminders/reminders.ts';
import { updateReminder } from '../src/reminders/reschedule.ts';
import { assignTask } from '../src/tasks/task-assign.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { captureAllTopics, publishedSince } from './realtime-capture.ts';

const agentId = 'agt_task_refs';
let chatId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let securityBoardId: string;
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
        insert into agents (id, server_id, handle, display_name, home_timezone)
        values (${agentId}, ${serverId}, 'refs-cove', 'Cove', 'America/New_York')
    `;
    await harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${serverId}, ${chatId}, ${agentId})
    `;
    const { board } = await owner.trpc.board.create.mutate({
        key: 'SEC',
        name: 'Security',
        serverId,
    });
    securityBoardId = board.id;
    sec1 = (await owner.trpc.task.create.mutate({ boardId: board.id, serverId, title: 'Audit' }))
        .task;
    const [general] = await owner.trpc.board.list.query({ serverId });
    gen1 = (
        await owner.trpc.task.create.mutate({ boardId: general?.id ?? '', serverId, title: 'Gen' })
    ).task;
});

afterAll(async () => {
    owner?.close();
    await connection?.close();
    await harness?.close();
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
                threadAnchorMessageId: null,
            }),
        ]);
    });

    test('re-keying a board re-keys message links but keeps the matched text', async () => {
        const sent = await owner.trpc.chat.send.mutate({
            chatId,
            content: 'SEC-1 again',
            nonce: 'refs-rekey',
            serverId,
        });
        const [, security] = await owner.trpc.board.list.query({ serverId });
        await owner.trpc.board.update.mutate({
            boardId: securityBoardId,
            expectedVersion: security?.version ?? 1,
            patch: { key: 'SAFE' },
            serverId,
        });
        const page = await owner.trpc.chat.messages.query({ chatId, serverId });
        expect(page.messages.find((message) => message.id === sent.message.id)?.taskLinks).toEqual([
            { key: 'SAFE-1', taskId: sec1.id, text: 'SEC-1' },
        ]);
        const detail = await owner.trpc.task.get.query({ key: 'SAFE-1', serverId });
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
                title: 'Follow up',
            },
        ]);

        await updateReminder(
            connection.db,
            agentId,
            {
                commandId: 'refs-reminder-update',
                description: 'Check SAFE-1 instead',
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
    test('publishes task events to everyone and inbox changes to the assignee only', async () => {
        const [userRow] = (await harness.sql`
            select id from users where auth_subject = 'user_refs'
        `) as { id: string }[];
        const realtime = captureAllTopics();
        const { task } = await owner.trpc.task.create.mutate({
            assignee: { agentId, kind: 'agent' },
            boardId: securityBoardId,
            serverId,
            title: 'Evented',
        });
        await owner.trpc.task.assign.mutate({
            assignee: null,
            expectedVersion: 1,
            serverId,
            taskId: task.id,
        });
        const published = await publishedSince(realtime, serverId);
        expect(
            published
                .filter((event) => event.taskId === task.id)
                .map(({ type, version }) => ({ type, version }))
        ).toEqual([
            { type: 'task.created', version: 1 },
            { type: 'task.updated', version: 2 },
        ]);
        expect(published.some((event) => event.type === 'taskInbox.changed')).toBe(false);
        realtime.stop();

        // An Agent assigning a person reaches that person's Task Inbox, and only theirs.
        const userId = userRow?.id ?? '';
        const result = await assignTask(
            connection.db,
            { agentId, kind: 'agent' },
            { enqueue: () => Promise.resolve() },
            { assignee: { kind: 'user', userId }, expectedVersion: 2, serverId, taskId: task.id }
        );
        expect(result.assignmentChange).toMatchObject({
            actor: { agentId, kind: 'agent' },
            next: { kind: 'user', userId },
            previous: null,
        });
        expect(
            result.events
                .filter((event) => event.topic === 'taskInbox.changed')
                .map((event) => event.delivery)
        ).toEqual([{ audienceUserId: userId, event: { serverId, userId } }]);
        const [item] = (await harness.sql`
            select assigned_by_agent_id from task_inbox_items where task_id = ${task.id}
        `) as { assigned_by_agent_id: string }[];
        expect(item?.assigned_by_agent_id).toBe(agentId);
    });
});
