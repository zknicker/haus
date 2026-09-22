import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('user_chat_paging'));
    outsider = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('user_chat_paging_outsider')
    );
});

afterAll(async () => {
    owner.close();
    outsider.close();
    await harness.close();
});

test('chat history traverses 1001 messages in both directions without gaps or duplicates', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Bidirectional paging',
        slug: 'bidirectional-paging',
    });
    const chatId = server.channels[0].id;
    const [ownerUser] = (await harness.sql`
        select id from users where clerk_user_id = 'user_chat_paging'
    `) as Array<{ id: string }>;

    await harness.sql`
        insert into chat_messages (
            id, server_id, chat_id, content, nonce, author_user_id,
            reply_root_message_id, sequence
        )
        select
            'msg_paging_' || series.i::text,
            ${server.id},
            ${chatId},
            'Paging message ' || series.i::text,
            'paging-' || series.i::text,
            ${ownerUser.id},
            'msg_paging_' || series.i::text,
            series.i
        from generate_series(1, 1001) as series(i)
    `;
    await harness.sql`
        update chats
        set last_message_sequence = 1001
        where server_id = ${server.id} and id = ${chatId}
    `;

    const latest = await owner.trpc.chat.messages.query({ chatId, limit: 37, serverId: server.id });
    expect(latest.messages.map(({ sequence }) => sequence)).toEqual(
        Array.from({ length: 37 }, (_, index) => index + 965)
    );
    expect(latest.nextBeforeSequence).toBe(965);
    expect(latest.nextAfterSequence).toBeNull();

    const backwards: number[] = latest.messages.map(({ sequence }) => sequence);
    let older = latest;
    while (older.nextBeforeSequence !== null) {
        older = await owner.trpc.chat.messages.query({
            beforeSequence: older.nextBeforeSequence,
            chatId,
            limit: 37,
            serverId: server.id,
        });
        backwards.unshift(...older.messages.map(({ sequence }) => sequence));
    }
    expect(backwards).toEqual(Array.from({ length: 1001 }, (_, index) => index + 1));
    expect(new Set(backwards).size).toBe(1001);

    const forwards: number[] = [];
    let newer = await owner.trpc.chat.messages.query({
        afterSequence: 0,
        chatId,
        limit: 37,
        serverId: server.id,
    });
    while (true) {
        forwards.push(...newer.messages.map(({ sequence }) => sequence));
        if (newer.nextAfterSequence === null) {
            break;
        }
        newer = await owner.trpc.chat.messages.query({
            afterSequence: newer.nextAfterSequence,
            chatId,
            limit: 37,
            serverId: server.id,
        });
    }
    expect(forwards).toEqual(Array.from({ length: 1001 }, (_, index) => index + 1));
    expect(new Set(forwards).size).toBe(1001);

    const around = await owner.trpc.chat.messages.query({
        aroundMessageId: 'msg_paging_500',
        chatId,
        limit: 41,
        serverId: server.id,
    });
    expect(around.messages.map(({ sequence }) => sequence)).toEqual(
        Array.from({ length: 41 }, (_, index) => index + 480)
    );
    expect(around.nextBeforeSequence).toBe(480);
    expect(around.nextAfterSequence).toBe(520);

    const exclusiveBefore = await owner.trpc.chat.messages.query({
        beforeSequence: 500,
        chatId,
        limit: 5,
        serverId: server.id,
    });
    const exclusiveAfter = await owner.trpc.chat.messages.query({
        afterSequence: 500,
        chatId,
        limit: 5,
        serverId: server.id,
    });
    expect(exclusiveBefore.messages.map(({ sequence }) => sequence)).toEqual([
        495, 496, 497, 498, 499,
    ]);
    expect(exclusiveAfter.messages.map(({ sequence }) => sequence)).toEqual([
        501, 502, 503, 504, 505,
    ]);

    const emptyBefore = await owner.trpc.chat.messages.query({
        beforeSequence: 1,
        chatId,
        limit: 5,
        serverId: server.id,
    });
    expect(emptyBefore.messages).toEqual([]);
    expect(emptyBefore.nextBeforeSequence).toBeNull();
    expect(emptyBefore.nextAfterSequence).toBe(0);

    const emptyAfter = await owner.trpc.chat.messages.query({
        afterSequence: 1001,
        chatId,
        limit: 5,
        serverId: server.id,
    });
    expect(emptyAfter.messages).toEqual([]);
    expect(emptyAfter.nextBeforeSequence).toBe(1002);
    expect(emptyAfter.nextAfterSequence).toBeNull();

    const singleServer = await owner.trpc.server.create.mutate({
        displayName: 'Single-message paging',
        slug: 'single-message-paging',
    });
    const singleChatId = singleServer.channels[0].id;
    await owner.trpc.chat.send.mutate({
        chatId: singleChatId,
        content: 'Only message',
        nonce: 'single-message',
        serverId: singleServer.id,
    });
    const singleBefore = await owner.trpc.chat.messages.query({
        beforeSequence: 1,
        chatId: singleChatId,
        limit: 5,
        serverId: singleServer.id,
    });
    const singleAfter = await owner.trpc.chat.messages.query({
        afterSequence: 1,
        chatId: singleChatId,
        limit: 5,
        serverId: singleServer.id,
    });
    expect(singleBefore.nextAfterSequence).toBe(0);
    expect(singleAfter.nextBeforeSequence).toBe(2);

    await expect(
        outsider.trpc.chat.messages.query({
            aroundMessageId: 'msg_paging_500',
            chatId,
            limit: 5,
            serverId: server.id,
        })
    ).rejects.toThrow(/member|participant|Server/i);
});

test('around and directional cursors honor inline-root filters and not-found anchors', async () => {
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Filtered paging',
        slug: 'filtered-paging',
    });
    const chatId = server.channels[0].id;
    const send = (content: string, replyToMessageId?: string) =>
        owner.trpc.chat.send.mutate({
            chatId,
            content,
            nonce: `filtered-${content}`,
            replyToMessageId,
            serverId: server.id,
        });
    const root = await send('Root');
    const unrelated = await send('Unrelated');
    const firstReply = await send('First reply', root.message.id);
    const nestedReply = await send('Nested reply', firstReply.message.id);

    const filtered = await owner.trpc.chat.messages.query({
        chatId,
        limit: 2,
        replyRootMessageId: nestedReply.message.id,
        serverId: server.id,
    });
    expect(filtered.messages.map(({ id }) => id)).toEqual([
        firstReply.message.id,
        nestedReply.message.id,
    ]);
    expect(filtered.nextBeforeSequence).toBe(firstReply.message.sequence);
    expect(filtered.nextAfterSequence).toBeNull();

    const older = await owner.trpc.chat.messages.query({
        beforeSequence: filtered.nextBeforeSequence ?? 0,
        chatId,
        limit: 2,
        replyRootMessageId: nestedReply.message.id,
        serverId: server.id,
    });
    expect(older.messages.map(({ id }) => id)).toEqual([root.message.id]);
    expect(older.nextBeforeSequence).toBeNull();
    expect(older.nextAfterSequence).toBe(root.message.sequence);

    const newer = await owner.trpc.chat.messages.query({
        afterSequence: root.message.sequence,
        chatId,
        limit: 2,
        replyRootMessageId: nestedReply.message.id,
        serverId: server.id,
    });
    expect(newer.messages.map(({ id }) => id)).toEqual([
        firstReply.message.id,
        nestedReply.message.id,
    ]);
    expect(newer.nextBeforeSequence).toBe(firstReply.message.sequence);
    expect(newer.nextAfterSequence).toBeNull();

    const around = await owner.trpc.chat.messages.query({
        aroundMessageId: nestedReply.message.id,
        chatId,
        limit: 3,
        replyRootMessageId: nestedReply.message.id,
        serverId: server.id,
    });
    expect(around.messages.map(({ id }) => id)).toEqual([
        root.message.id,
        firstReply.message.id,
        nestedReply.message.id,
    ]);
    expect(around.nextBeforeSequence).toBeNull();
    expect(around.nextAfterSequence).toBeNull();

    await expect(
        owner.trpc.chat.messages.query({
            aroundMessageId: unrelated.message.id,
            chatId,
            limit: 3,
            replyRootMessageId: nestedReply.message.id,
            serverId: server.id,
        })
    ).rejects.toThrow(/history filter|does not exist/i);
});
