import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let client: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    const token = await harness.humans.mintSessionToken('user_hosted_messages');
    client = createHausClient(harness, token);
});

afterAll(async () => {
    client.close();
    await harness.close();
});

test('a human sends an immutable message to #all and reads it back by sequence', async () => {
    const server = await client.trpc.server.create.mutate({
        displayName: 'Message Server',
        slug: 'message-server',
    });
    const chatId = server.channels[0].id;

    const sent = await client.trpc.chat.send.mutate({
        chatId,
        content: 'Hello from Haus.',
        nonce: 'message-send-1',
        serverId: server.id,
    });

    expect(sent).toMatchObject({
        idempotent: false,
        message: {
            chatId,
            content: 'Hello from Haus.',
            nonce: 'message-send-1',
            sequence: 1,
            serverId: server.id,
        },
    });

    await expect(
        client.trpc.chat.messages.query({ chatId, serverId: server.id })
    ).resolves.toMatchObject({
        messages: [{ id: sent.message.id, sequence: 1 }],
        nextBeforeSequence: null,
    });
});

test('concurrent sends allocate one stable sequence per nonce', async () => {
    const server = await client.trpc.server.bySlug.query({ slug: 'message-server' });
    const chatId = server.channels[0].id;
    const sends = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
            client.trpc.chat.send.mutate({
                chatId,
                content: `Concurrent ${index + 1}`,
                nonce: `concurrent-${index + 1}`,
                serverId: server.id,
            })
        )
    );

    expect(
        sends.map((receipt) => receipt.message.sequence).sort((left, right) => left - right)
    ).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

    const retries = await Promise.all(
        Array.from({ length: 4 }, () =>
            client.trpc.chat.send.mutate({
                chatId,
                content: 'One logical retry.',
                nonce: 'same-logical-send',
                serverId: server.id,
            })
        )
    );

    expect(new Set(retries.map((receipt) => receipt.message.id)).size).toBe(1);
    expect(retries.filter((receipt) => !receipt.idempotent)).toHaveLength(1);
    expect(retries.map((receipt) => receipt.message.sequence)).toEqual([14, 14, 14, 14]);

    await expect(
        client.trpc.chat.send.mutate({
            chatId,
            content: 'Different content.',
            nonce: 'same-logical-send',
            serverId: server.id,
        })
    ).rejects.toThrow(/different send/i);

    await expect(
        client.trpc.chat.messages.query({ chatId, limit: 14, serverId: server.id })
    ).resolves.toMatchObject({ nextBeforeSequence: null });
    await expect(
        client.trpc.chat.messages.query({ chatId, limit: 5, serverId: server.id })
    ).resolves.toMatchObject({
        messages: [
            { sequence: 10 },
            { sequence: 11 },
            { sequence: 12 },
            { sequence: 13 },
            { sequence: 14 },
        ],
        nextBeforeSequence: 10,
    });
});

test('the Chat list quotes the newest top-level Message with its resolved author', async () => {
    const server = await client.trpc.server.create.mutate({
        displayName: 'Last Message Server',
        slug: 'last-message-server',
    });
    const chatId = server.channels[0].id;
    const [user] = (await harness.sql`
        select id from users where auth_subject = 'user_hosted_messages'
    `) as { id: string }[];
    await harness.sql`
        update users set display_name = 'Quinn Reader' where id = ${user.id}
    `;

    const empty = (await client.trpc.chat.list.query({ serverId: server.id })).find(
        (chat) => chat.id === chatId
    );
    expect(empty?.lastMessage).toBeNull();

    await client.trpc.chat.send.mutate({
        chatId,
        content: 'First line.',
        nonce: 'last-message-1',
        serverId: server.id,
    });
    const newest = await client.trpc.chat.send.mutate({
        chatId,
        content: 'Newest **line**.',
        nonce: 'last-message-2',
        serverId: server.id,
    });

    const listed = (await client.trpc.chat.list.query({ serverId: server.id })).find(
        (chat) => chat.id === chatId
    );
    expect(listed?.lastMessage).toEqual({
        authorDisplayName: 'Quinn Reader',
        content: 'Newest **line**.',
        createdAt: newest.message.createdAt,
    });

    const read = await client.trpc.chat.messages.query({ chatId, serverId: server.id });
    expect(read.messages.at(-1)?.author.profile?.displayName).toBe(
        listed?.lastMessage?.authorDisplayName ?? ''
    );
});

test('a Thread reply never becomes the parent Chat last message', async () => {
    const server = await client.trpc.server.create.mutate({
        displayName: 'Thread Last Message',
        slug: 'thread-last-message',
    });
    const parentChatId = server.channels[0].id;
    const anchor = await client.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Top-level anchor.',
        nonce: 'thread-last-anchor',
        serverId: server.id,
    });
    await client.trpc.chat.send.mutate({
        chatId: parentChatId,
        content: 'Thread-only reply.',
        nonce: 'thread-last-reply',
        serverId: server.id,
        thread: { anchorMessageId: anchor.message.id },
    });

    const listed = (await client.trpc.chat.list.query({ serverId: server.id })).find(
        (chat) => chat.id === parentChatId
    );
    expect(listed?.lastMessage).toMatchObject({ content: 'Top-level anchor.' });
});
