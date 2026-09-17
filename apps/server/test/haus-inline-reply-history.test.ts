import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_reply_history'));
});
afterAll(async () => {
    owner.close();
    await harness.close();
});

test('task inspection pages its inline chain without including unrelated chat messages or creating a thread', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Reply history',
        slug: 'reply-history',
    });
    const chatId = server.channels[0].id;
    const send = (content: string, replyToMessageId?: string) =>
        owner.trpc.chat.send.mutate({
            chatId,
            serverId: server.id,
            content,
            nonce: content,
            replyToMessageId,
        });
    const root = await send('Original request');
    await send('Unrelated channel request');
    const first = await send('First answer', root.message.id);
    const nested = await send('Follow-up question', first.message.id);
    const page = await owner.trpc.chat.messages.query({
        chatId,
        serverId: server.id,
        replyRootMessageId: nested.message.id,
        limit: 2,
    });
    expect(page.messages.map(({ id }) => id)).toEqual([first.message.id, nested.message.id]);
    expect(page.nextBeforeSequence).toBe(first.message.sequence);
    const older = await owner.trpc.chat.messages.query({
        chatId,
        serverId: server.id,
        replyRootMessageId: nested.message.id,
        beforeSequence: page.nextBeforeSequence ?? undefined,
        limit: 2,
    });
    expect(older.messages.map(({ id }) => id)).toEqual([root.message.id]);
    expect(older.nextBeforeSequence).toBeNull();
    const threads =
        await harness.sql`select id from chats where server_id=${server.id} and kind='thread'`;
    expect(threads).toHaveLength(0);
});
