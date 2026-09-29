import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type NeedsYouFixture, startNeedsYouFixture } from './needs-you-fixture.ts';

let fixture: NeedsYouFixture;

beforeAll(async () => {
    fixture = await startNeedsYouFixture();
});

afterAll(async () => {
    await fixture.close();
});

test('a mention from either send path records the human and is their Needs you row', async () => {
    const {
        createChannel,
        harness,
        mintRunner,
        orbitAgentId,
        owner,
        ownerUserId,
        peer,
        peerUserId,
        sendAgentMessage,
        serverId,
    } = fixture;
    const channelId = await createChannel('mentions');
    const orbit = await mintRunner(orbitAgentId, 'run_needs_mention', channelId);
    await sendAgentMessage(orbit, '#mentions', 'needs-mention-agent', '@ada can you sign off?');
    const human = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: `[@Ada](user://${ownerUserId}) and [@Bo](user://${peerUserId}) — see above.`,
        nonce: 'needs-mention-human',
        serverId,
    });

    const stored = (await harness.sql`
        select author_user_id, mentioned_user_ids from chat_messages
        where server_id = ${serverId} and chat_id = ${channelId} order by sequence
    `) as Array<{ author_user_id: string | null; mentioned_user_ids: string[] }>;
    expect(stored.map((row) => row.mentioned_user_ids)).toEqual([
        [ownerUserId],
        [ownerUserId, peerUserId],
    ]);

    const [row] = (await owner.trpc.inbox.needsYou.query({ serverId })).filter(
        (candidate) => candidate.chatId === channelId
    );
    expect(row).toEqual({
        addressedCount: 2,
        chatId: channelId,
        chatKind: 'channel',
        chatName: 'mentions',
        conversationChatId: channelId,
        latest: {
            author: expect.objectContaining({ kind: 'human', userId: peerUserId }),
            createdAt: human.message.createdAt,
            messageId: human.message.id,
            preview: '@Ada and @Bo — see above.',
            sequence: human.message.sequence,
        },
        reason: 'mention',
        threadAnchorMessageId: null,
    });
    // Bo's own message never addresses Bo; Orbit's did not mention Bo.
    expect(
        (await peer.trpc.inbox.needsYou.query({ serverId })).some(
            (candidate) => candidate.chatId === channelId
        )
    ).toBe(false);
});

test('a reply clears a mention only in its exchange, Thread, or the Thread on it', async () => {
    const {
        createChannel,
        harness,
        mintRunner,
        orbitAgentId,
        owner,
        rowFor,
        scoutAgentId,
        sendAgentMessage,
        serverId,
    } = fixture;
    const channelId = await createChannel('exchange');
    const orbit = await mintRunner(orbitAgentId, 'run_needs_exchange', channelId);
    const first = await sendAgentMessage(orbit, '#exchange', 'needs-ex-1', '@ada approve A?');

    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Unrelated top-level note.',
        nonce: 'needs-ex-unrelated',
        serverId,
    });
    expect(await rowFor(channelId)).toMatchObject({ addressedCount: 1 });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Approved.',
        nonce: 'needs-ex-inline',
        replyToMessageId: first.messageId,
        serverId,
    });
    expect(await rowFor(channelId)).toBeUndefined();

    // Answering in the Thread on an Agent's message clears it and follows the
    // Agent anchor author, so the reply wakes that Agent.
    const second = await sendAgentMessage(orbit, '#exchange', 'needs-ex-2', '@ada approve B?');
    const threadReply = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'B is fine.',
        nonce: 'needs-ex-thread',
        serverId,
        thread: { anchorMessageId: second.messageId },
    });
    const threadChatId = threadReply.threadChatId as string;
    expect(await rowFor(channelId)).toBeUndefined();
    expect(
        await harness.sql`
            select followed from agent_thread_follows
            where server_id = ${serverId} and agent_id = ${orbitAgentId}
              and thread_chat_id = ${threadChatId}
        `
    ).toEqual([{ followed: true }]);
    expect(
        await harness.sql`
            select agent_id from agent_inbox
            where server_id = ${serverId} and dedupe_key = ${threadReply.message.id}
        `
    ).toContainEqual({ agent_id: orbitAgentId });

    // A mention inside that Thread is a Thread row, cleared only by a reply there.
    const scout = await mintRunner(scoutAgentId, 'run_needs_thread', channelId);
    const threadTarget = `#exchange:${second.messageId.slice('msg_'.length, 'msg_'.length + 8)}`;
    const inThread = await sendAgentMessage(scout, threadTarget, 'needs-ex-3', '@ada one more?');
    expect(await rowFor(threadChatId)).toMatchObject({
        addressedCount: 1,
        chatName: 'exchange',
        conversationChatId: channelId,
        latest: { messageId: inThread.messageId },
        threadAnchorMessageId: second.messageId,
    });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Replying at the top level does not reach the Thread.',
        nonce: 'needs-ex-top',
        serverId,
    });
    expect(await rowFor(threadChatId)).toBeDefined();
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Yes, one more.',
        nonce: 'needs-ex-thread-answer',
        serverId,
        thread: { anchorMessageId: second.messageId },
    });
    expect(await rowFor(threadChatId)).toBeUndefined();
});

test('a human reply follows the Agent anchor author only when it opens the Thread', async () => {
    const { createChannel, harness, mintRunner, orbitAgentId, owner, sendAgentMessage, serverId } =
        fixture;
    const channelId = await createChannel('later-thread');
    const orbit = await mintRunner(orbitAgentId, 'run_needs_later', channelId);
    const anchor = await sendAgentMessage(
        orbit,
        '#later-thread',
        'needs-later-1',
        'Status update.'
    );
    const send = (nonce: string) =>
        owner.trpc.chat.send.mutate({
            chatId: channelId,
            content: 'Chatting under an old message.',
            nonce,
            serverId,
            thread: { anchorMessageId: anchor.messageId },
        });
    const orbitFollow = (threadChatId: string) => harness.sql`
        select followed from agent_thread_follows
        where server_id = ${serverId} and agent_id = ${orbitAgentId}
          and thread_chat_id = ${threadChatId}
    `;

    const opening = await send('needs-later-open');
    const threadChatId = opening.threadChatId as string;
    expect(await orbitFollow(threadChatId)).toEqual([{ followed: true }]);

    // An existing Thread the Agent does not follow (say, one opened before this
    // rule) stays unfollowed: a later human send must not start waking it.
    await harness.sql`
        delete from agent_thread_follows
        where server_id = ${serverId} and agent_id = ${orbitAgentId}
          and thread_chat_id = ${threadChatId}
    `;
    const later = await send('needs-later-again');
    expect(await orbitFollow(threadChatId)).toEqual([]);
    expect(
        await harness.sql`
            select agent_id from agent_inbox
            where server_id = ${serverId} and dedupe_key = ${later.message.id}
        `
    ).not.toContainEqual({ agent_id: orbitAgentId });
});

test('a later message that mentions the author clears a Channel mention', async () => {
    const {
        createChannel,
        mintRunner,
        orbitAgentId,
        owner,
        ownerUserId,
        peer,
        peerUserId,
        rowFor,
        sendAgentMessage,
        serverId,
    } = fixture;
    const channelId = await createChannel('reach-back');
    const orbit = await mintRunner(orbitAgentId, 'run_needs_reach', channelId);
    await sendAgentMessage(orbit, '#reach-back', 'needs-reach-1', '@ada approve C?');
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `[@Bo](user://${peerUserId}) unrelated.`,
        nonce: 'needs-reach-other',
        serverId,
    });
    expect(await rowFor(channelId)).toMatchObject({ addressedCount: 1 });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `[@orbit](agent://${orbitAgentId}) approved.`,
        nonce: 'needs-reach-agent',
        serverId,
    });
    expect(await rowFor(channelId)).toBeUndefined();

    // A human author is reached the same way, through their user mention.
    await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: `[@Ada](user://${ownerUserId}) one more?`,
        nonce: 'needs-reach-human',
        serverId,
    });
    expect(await rowFor(channelId)).toMatchObject({ addressedCount: 1 });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `[@Bo](user://${peerUserId}) sure.`,
        nonce: 'needs-reach-human-answer',
        serverId,
    });
    expect(await rowFor(channelId)).toBeUndefined();
});
