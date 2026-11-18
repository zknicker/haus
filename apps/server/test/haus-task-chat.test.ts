import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { findTaskByChatId, reopenTaskOnPost, taskTargetForChat } from '../src/tasks/task-chat.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { startTestTask } from './task-place-fixture.ts';

let channelId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let first: { chatId: string; id: string; key: string };
let second: { chatId: string; id: string; key: string };

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await createHausClient(harness, await harness.humans.mintSessionToken('task_chat'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Chats',
        slug: 'task-chats',
    });
    serverId = server.id;
    channelId = server.channels[0]?.id ?? '';
    const origin = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Two problems in the deploy',
        nonce: 'task-chat-origin',
        serverId,
    });
    const start = (title: string) =>
        startTestTask(harness, owner, {
            channelId,
            originMessageId: origin.message.id,
            serverId,
            title,
        });
    first = await start('Rotate the key');
    second = await start('Fix the health check');
});

afterAll(async () => {
    owner?.close();
    await connection?.close();
    await harness?.close();
});

test('one origin Message carries several Tasks, each with its own Chat', async () => {
    expect(await findTaskByChatId(connection.db, { chatId: first.chatId, serverId })).toEqual({
        chatId: first.chatId,
        key: first.key,
        serverId,
        state: 'todo',
        taskId: first.id,
        version: 1,
    });
    expect(
        (await findTaskByChatId(connection.db, { chatId: second.chatId, serverId }))?.taskId
    ).toBe(second.id);
    expect(await findTaskByChatId(connection.db, { chatId: channelId, serverId })).toBeNull();
});

test('a Task Chat sends to task: and its key; other Chats have no Task target', async () => {
    expect(await taskTargetForChat(connection.db, { chatId: first.chatId, serverId })).toBe(
        `task:${first.key}`
    );
    expect(await taskTargetForChat(connection.db, { chatId: channelId, serverId })).toBeNull();
});

test('a task Chat must hang off a Channel Message, never a DM or nothing', async () => {
    const run = async (query: PromiseLike<unknown>) => await query;
    await expect(
        run(harness.sql`
            insert into chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
            values (${createOpaqueId('cht')}, ${serverId}, 'task', ${channelId}, 'channel')
        `)
    ).rejects.toThrow(/chats_shape/u);
    await expect(
        run(harness.sql`update tasks set chat_id = ${first.chatId} where id = ${second.id}`)
    ).rejects.toThrow(/tasks_chat_key/u);
});

test('posting in a done or canceled Task reopens it once', async () => {
    await harness.sql`update tasks set state = 'done', completed_at = now() where id = ${first.id}`;
    const reopened = await connection.db.transaction(
        async (tx) => await reopenTaskOnPost(tx, { chatId: first.chatId, serverId })
    );
    expect(reopened).toMatchObject({ state: 'open', taskId: first.id, version: 2 });
    expect(
        await connection.db.transaction(
            async (tx) => await reopenTaskOnPost(tx, { chatId: first.chatId, serverId })
        )
    ).toBeNull();
    expect(
        await connection.db.transaction(
            async (tx) => await reopenTaskOnPost(tx, { chatId: channelId, serverId })
        )
    ).toBeNull();

    await harness.sql`update tasks set state = 'canceled', completed_at = now() where id = ${second.id}`;
    expect(
        await connection.db.transaction(
            async (tx) => await reopenTaskOnPost(tx, { chatId: second.chatId, serverId })
        )
    ).toMatchObject({ state: 'open', taskId: second.id });
});

test('task.get reads the Task Chat and its origin', async () => {
    const detail = await owner.trpc.task.get.query({ serverId, taskId: second.id });
    expect(detail).toMatchObject({
        attachedWork: [],
        chatId: second.chatId,
        followed: false,
        origin: { chatId: channelId, messageId: expect.any(String) },
        pullRequests: [],
        state: 'open',
        unreadCount: 0,
    });
});
