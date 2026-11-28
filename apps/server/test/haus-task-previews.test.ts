import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { startTestTask, type TestTask } from './task-place-fixture.ts';

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
    agentId: null,
    archivedAt: null,
    chatId: task.chatId,
    followed: false,
    messageCount: 0,
    model: null,
    originMessageId: task.originMessageId,
    recentMessages: [],
    shortId: task.shortId,
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
