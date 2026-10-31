import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    const token = await harness.humans.mintSessionToken('user_thread_owner');
    owner = createHausClient(harness, token);
});

afterAll(async () => {
    owner.close();
    await harness.close();
});

test('Thread authorization derives only from the parent and nesting is rejected', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Thread Authorization',
        slug: 'thread-authorization',
    });
    const parentChatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Authorization anchor',
        nonce: 'authorization-anchor',
        serverId: server.id,
    });
    const reply = await owner.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Authorization reply',
        nonce: 'authorization-reply',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = reply.threadChatId as string;
    const outsiderToken = await harness.humans.mintSessionToken('user_thread_outsider');
    const outsider = createHausClient(harness, outsiderToken);
    const outsiderServer = await outsider.trpc.server.create.mutate({
        displayName: 'Thread Outsider',
        slug: 'thread-outsider',
    });
    const [{ id: outsiderUserId }] = (await harness.sql`
        select id from users where auth_subject = 'user_thread_outsider'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_thread_outsider', ${server.id}, ${outsiderUserId}, 'member')
    `;

    await expect(
        outsider.trpc.chat.messages.query({ chatId: threadChatId, serverId: server.id })
    ).rejects.toThrow(/participant/i);
    await harness.sql`
        insert into channel_participants (server_id, chat_id, user_id)
        values (${server.id}, ${parentChatId}, ${outsiderUserId})
    `;
    await expect(
        outsider.trpc.chat.messages.query({ chatId: threadChatId, serverId: server.id })
    ).resolves.toMatchObject({ messages: [{ id: reply.message.id }] });
    await expect(
        outsider.trpc.chat.messages.query({
            chatId: threadChatId,
            serverId: outsiderServer.id,
        })
    ).rejects.toThrow(/exists|member/i);
    await expect(
        owner.trpc.chat.send.mutate({
            chatId: threadChatId,
            content: 'Nested reply',
            nonce: 'nested-reply',
            serverId: server.id,
            thread: { anchorMessageId: reply.message.id },
        })
    ).rejects.toThrow(/cannot contain/i);
    await expect(
        owner.trpc.chat.send.mutate({
            chatId: threadChatId,
            content: 'Bypass parent and anchor',
            nonce: 'direct-thread-reply',
            serverId: server.id,
        })
    ).rejects.toThrow(/parent Chat and anchor/i);

    outsider.close();
});

// The anchor renders its Thread as a preview block, so the summary carries the
// tail of the conversation rather than a bare count.
test('a Thread summary previews its newest replies, oldest first', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Preview Server',
        slug: 'preview-server',
    });
    const parentChatId = server.channels[0].id;
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Anchor',
        nonce: 'preview-anchor',
        serverId: server.id,
    });

    for (const content of ['one', 'two', 'three', 'four']) {
        await owner.trpc.chat.send.mutate({
            chatId: parentChatId,
            content,
            nonce: `preview-${content}`,
            serverId: server.id,
            thread: { anchorMessageId: anchor.message.id },
        });
    }

    const { threads } = await owner.trpc.chat.messages.query({
        chatId: parentChatId,
        serverId: server.id,
    });
    const summary = threads.find((thread) => thread.anchorMessageId === anchor.message.id);

    expect(summary?.replyCount).toBe(4);
    // The oldest reply falls off; what remains reads in conversation order.
    expect(summary?.recentReplies.map((reply) => reply.content)).toEqual(['two', 'three', 'four']);
    expect(summary?.recentReplies.every((reply) => reply.authorUserId !== null)).toBe(true);
});
