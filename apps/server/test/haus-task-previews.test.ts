import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';

/**
 * ADR 0053 decision 7: a Channel previews the Tasks started from its messages,
 * on a `chat.messages` page and on the single-message `chat.message` read alike,
 * and a Task with nothing posted yet still previews its state and title.
 */
let channelId: string;
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;
let task: TestTask;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await createHausClient(harness, await harness.humans.mintSessionToken('previews'));
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task Previews',
        slug: 'task-previews',
    });
    serverId = server.id;
    channelId = server.channels[0]?.id ?? '';
    task = await startTestTask(harness, owner, { channelId, serverId, title: 'Quiet so far' });
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

const emptyPreview = () => ({
    chatId: task.chatId,
    followed: false,
    key: task.key,
    messageCount: 0,
    originMessageId: task.originMessageId,
    recentMessages: [],
    state: 'todo',
    taskId: task.id,
    title: 'Quiet so far',
    unreadCount: 0,
});

test('a Task with zero messages still previews on its origin Message', async () => {
    const page = await owner.trpc.chat.messages.query({ chatId: channelId, serverId });
    expect(page.tasks).toEqual([emptyPreview()]);
});

test('chat.message carries the Tasks started from that message, like chat.messages', async () => {
    const origin = await owner.trpc.chat.message.query({
        chatId: channelId,
        messageId: task.originMessageId,
        serverId,
    });
    expect(origin?.tasks).toEqual([emptyPreview()]);

    await owner.trpc.chat.send.mutate({
        chatId: task.chatId,
        content: 'First note.',
        nonce: 'previews-first-note',
        serverId,
    });
    const after = await owner.trpc.chat.message.query({
        chatId: channelId,
        messageId: task.originMessageId,
        serverId,
    });
    expect(after?.tasks).toEqual([
        expect.objectContaining({
            messageCount: 1,
            recentMessages: [expect.objectContaining({ content: 'First note.' })],
        }),
    ]);

    const other = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'No Task here.',
        nonce: 'previews-other',
        serverId,
    });
    const plain = await owner.trpc.chat.message.query({
        chatId: channelId,
        messageId: other.message.id,
        serverId,
    });
    expect(plain?.tasks).toEqual([]);
});
