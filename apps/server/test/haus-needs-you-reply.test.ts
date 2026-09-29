import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type NeedsYouFixture, startNeedsYouFixture } from './needs-you-fixture.ts';

let fixture: NeedsYouFixture;

beforeAll(async () => {
    fixture = await startNeedsYouFixture();
});

afterAll(async () => {
    await fixture.close();
});

test("an inline reply to the viewer's Channel message addresses them like a mention", async () => {
    const { createChannel, mintRunner, orbitAgentId, owner, rowFor, sendAgentMessage, serverId } =
        fixture;
    const channelId = await createChannel('replies');
    const question = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Can someone check the deploy?',
        nonce: 'needs-reply-question',
        serverId,
    });
    const orbit = await mintRunner(orbitAgentId, 'run_needs_reply', channelId);
    const answer = await sendAgentMessage(
        orbit,
        '#replies',
        'needs-reply-1',
        'Deploy is green. Roll it out?',
        question.message.id
    );
    expect(await rowFor(channelId)).toMatchObject({
        addressedCount: 1,
        chatKind: 'channel',
        chatName: 'replies',
        latest: { author: { agentId: orbitAgentId, kind: 'agent' }, messageId: answer.messageId },
        reason: 'reply',
        threadAnchorMessageId: null,
    });

    // The viewer's inline reply in the same exchange reaches Orbit and clears it.
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Roll it out.',
        nonce: 'needs-reply-answer',
        replyToMessageId: answer.messageId,
        serverId,
    });
    expect(await rowFor(channelId)).toBeUndefined();
});

test('Done clears a reply row and a newer inline reply brings it back', async () => {
    const { createChannel, mintRunner, orbitAgentId, owner, rowFor, sendAgentMessage, serverId } =
        fixture;
    const channelId = await createChannel('reply-done');
    const question = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Any blockers?',
        nonce: 'needs-reply-done-question',
        serverId,
    });
    const orbit = await mintRunner(orbitAgentId, 'run_needs_reply_done', channelId);
    await sendAgentMessage(
        orbit,
        '#reply-done',
        'needs-reply-done-1',
        'None.',
        question.message.id
    );
    const row = await rowFor(channelId);
    expect(row).toMatchObject({ reason: 'reply' });
    await owner.trpc.inbox.markDone.mutate({
        chatId: channelId,
        serverId,
        throughSequence: row?.latest.sequence ?? 0,
    });
    expect(await rowFor(channelId)).toBeUndefined();

    const newer = await sendAgentMessage(
        orbit,
        '#reply-done',
        'needs-reply-done-2',
        'Actually, one blocker.',
        question.message.id
    );
    expect(await rowFor(channelId)).toMatchObject({
        addressedCount: 1,
        latest: { messageId: newer.messageId },
        reason: 'reply',
    });
});

test("a reply to someone else's message or the viewer's own reply is not addressing", async () => {
    const {
        createChannel,
        mintRunner,
        orbitAgentId,
        owner,
        peer,
        rowFor,
        sendAgentMessage,
        serverId,
    } = fixture;
    const channelId = await createChannel('reply-others');
    const bo = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Bo asks a question.',
        nonce: 'needs-reply-bo',
        serverId,
    });
    const orbit = await mintRunner(orbitAgentId, 'run_needs_reply_others', channelId);
    await sendAgentMessage(
        orbit,
        '#reply-others',
        'needs-reply-others-1',
        'For Bo.',
        bo.message.id
    );
    expect(await rowFor(channelId)).toBeUndefined();

    const own = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'A note.',
        nonce: 'needs-reply-own',
        serverId,
    });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Following up on myself.',
        nonce: 'needs-reply-own-2',
        replyToMessageId: own.message.id,
        serverId,
    });
    expect(await rowFor(channelId)).toBeUndefined();
});

test("a Thread on the viewer's message answers them until they reply there or mark Done", async () => {
    const { createChannel, mintRunner, orbitAgentId, owner, rowFor, sendAgentMessage, serverId } =
        fixture;
    const channelId = await createChannel('thread-answers');
    const question = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Which region should we deploy first?',
        nonce: 'needs-thread-answer-question',
        serverId,
    });
    const orbit = await mintRunner(orbitAgentId, 'run_needs_thread_answer', channelId);
    const target = `#thread-answers:${question.message.id.slice('msg_'.length, 'msg_'.length + 8)}`;
    const answer = await sendAgentMessage(orbit, target, 'needs-thread-answer-1', 'us-east first.');
    const threadChatId = await threadFor(question.message.id);
    // Replay names the anchor's author so a client knows to refetch Needs you.
    const replayed = await owner.trpc.chat.events.query({
        afterCursor: question.eventCursor,
        limit: 50,
        serverId,
    });
    expect(replayed.find((event) => event.chatId === threadChatId)).toMatchObject({
        threadAnchorAuthorUserId: fixture.ownerUserId,
        type: 'message.created',
    });
    expect(await rowFor(channelId)).toBeUndefined();
    expect(await rowFor(threadChatId)).toMatchObject({
        addressedCount: 1,
        chatKind: 'channel',
        conversationChatId: channelId,
        latest: { author: { agentId: orbitAgentId, kind: 'agent' }, messageId: answer.messageId },
        reason: 'reply',
        threadAnchorMessageId: question.message.id,
    });

    // The viewer's reply in that Thread reaches Orbit and clears it.
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Go.',
        nonce: 'needs-thread-answer-reply',
        serverId,
        thread: { anchorMessageId: question.message.id },
    });
    expect(await rowFor(threadChatId)).toBeUndefined();

    // A newer Thread message returns it; Done clears it; newer activity returns it.
    await sendAgentMessage(orbit, target, 'needs-thread-answer-2', 'Deployed us-east.');
    const row = await rowFor(threadChatId);
    expect(row).toMatchObject({ addressedCount: 1, reason: 'reply' });
    await owner.trpc.inbox.markDone.mutate({
        chatId: threadChatId,
        serverId,
        throughSequence: row?.latest.sequence ?? 0,
    });
    expect(await rowFor(threadChatId)).toBeUndefined();
    const newer = await sendAgentMessage(orbit, target, 'needs-thread-answer-3', 'eu-west next?');
    expect(await rowFor(threadChatId)).toMatchObject({
        addressedCount: 1,
        latest: { messageId: newer.messageId },
        reason: 'reply',
    });
});

test("a Thread on someone else's message, or the viewer's own Thread message, is not addressing", async () => {
    const {
        createChannel,
        mintRunner,
        orbitAgentId,
        owner,
        peer,
        rowFor,
        sendAgentMessage,
        serverId,
    } = fixture;
    const channelId = await createChannel('thread-others');
    const bo = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Bo asks in the open.',
        nonce: 'needs-thread-others-bo',
        serverId,
    });
    const orbit = await mintRunner(orbitAgentId, 'run_needs_thread_others', channelId);
    await sendAgentMessage(
        orbit,
        `#thread-others:${bo.message.id.slice('msg_'.length, 'msg_'.length + 8)}`,
        'needs-thread-others-1',
        'For Bo, in a Thread.'
    );
    expect(await rowFor(await threadFor(bo.message.id))).toBeUndefined();

    const own = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'A note to self.',
        nonce: 'needs-thread-others-own',
        serverId,
    });
    const followUp = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'More detail under it.',
        nonce: 'needs-thread-others-own-2',
        serverId,
        thread: { anchorMessageId: own.message.id },
    });
    expect(await rowFor(followUp.threadChatId as string)).toBeUndefined();
});

async function threadFor(anchorMessageId: string) {
    const rows = (await fixture.harness.sql`
        select id from chats where anchor_message_id = ${anchorMessageId}
    `) as { id: string }[];
    return rows[0]?.id ?? '';
}
