import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { findTaskByChatId, taskTargetForChat } from '../src/tasks/task-chat.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { startTestTask } from './task-place-fixture.ts';

let channelId: string;
let connection: HausConnection;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let first: { chatId: string; id: string; shortId: string };
let second: { chatId: string; id: string; shortId: string };

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
        archivedAt: null,
        chatId: first.chatId,
        serverId,
        shortId: first.shortId,
        taskId: first.id,
        version: 1,
    });
    expect(
        (await findTaskByChatId(connection.db, { chatId: second.chatId, serverId }))?.taskId
    ).toBe(second.id);
    expect(await findTaskByChatId(connection.db, { chatId: channelId, serverId })).toBeNull();
});

test('a Task Chat sends to task: and its short id; other Chats have no Task target', async () => {
    expect(await taskTargetForChat(connection.db, { chatId: first.chatId, serverId })).toBe(
        `task:${first.shortId}`
    );
    expect(await taskTargetForChat(connection.db, { chatId: channelId, serverId })).toBeNull();
});

test('a task Chat hangs off a Channel, and its Task names that Channel as its Project', async () => {
    const run = async (query: PromiseLike<unknown>) => await query;
    await expect(
        run(harness.sql`
            insert into chats (id, server_id, kind)
            values (${createOpaqueId('cht')}, ${serverId}, 'task')
        `)
    ).rejects.toThrow(/chats_shape/u);
    const other = await owner.trpc.project.create.mutate({ name: 'elsewhere', serverId });
    await expect(
        run(harness.sql`update tasks set project_id = ${other.chat.id} where id = ${first.id}`)
    ).rejects.toThrow(/tasks_chat_project_fk/u);
    await expect(
        run(harness.sql`update tasks set chat_id = ${first.chatId} where id = ${second.id}`)
    ).rejects.toThrow(/tasks_chat_key/u);
});

test('short ids are unique per Server and keep their shape', async () => {
    const run = async (query: PromiseLike<unknown>) => await query;
    await expect(
        run(harness.sql`update tasks set short_id = ${first.shortId} where id = ${second.id}`)
    ).rejects.toThrow(/tasks_short_id_key/u);
    await expect(
        run(harness.sql`update tasks set short_id = 'SEC-12ab' where id = ${second.id}`)
    ).rejects.toThrow(/tasks_short_id_shape/u);
});

test('task.get reads the Task Chat and its origin', async () => {
    const detail = await owner.trpc.task.get.query({ serverId, taskId: second.id });
    expect(detail).toMatchObject({
        archivedAt: null,
        attachedWork: [],
        chatId: second.chatId,
        followed: false,
        origin: { chatId: channelId, messageId: expect.any(String) },
        pullRequests: [],
        shortId: second.shortId,
        unreadCount: 0,
    });
});
