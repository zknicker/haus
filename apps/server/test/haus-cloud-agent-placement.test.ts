import { expect, test } from 'bun:test';
import type { CloudAgentWork } from '@haus/api';
import { threadChatIdForAnchor } from '../src/threads/thread-id.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';
import { cloudAgentLinkHelpers } from './cloud-agent-link-helpers.ts';

const fixture = cloudAgentFixture();
const links = cloudAgentLinkHelpers(fixture);

/**
 * ADR 0044 changes storage, never placement: each launch shape keeps its
 * Message, work Thread, follow, receipt target, and completion target.
 */
test('a channel launch creates and follows its work Thread and notifies the Channel', async () => {
    const placed = await launch('#product', 'place-channel');
    const threadId = threadChatIdForAnchor(placed.messageId);
    expect(placed.receipt).toMatchObject({ chatId: fixture.channelId, target: '#product' });
    expect(await chatOf(placed.messageId)).toBe(fixture.channelId);
    expect(await threadsUnder(fixture.channelId, placed.messageId)).toEqual([threadId]);
    expect(await orbitFollows(threadId)).toBe(true);
    expect(await settleTarget(placed)).toBe(fixture.channelId);
});

test('a launch inside an existing Thread stays there without nesting', async () => {
    const anchor = await links.humanSend(
        fixture.owner,
        fixture.channelId,
        'Can someone fix the build?',
        'place-thread-anchor'
    );
    const threadId = threadChatIdForAnchor(anchor.message.id);
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'It fails on main.',
        nonce: 'place-thread-reply',
        serverId: fixture.serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const target = `#product:${anchor.message.id}`;
    const placed = await launch(target, 'place-thread');
    expect(placed.receipt).toMatchObject({ chatId: threadId, target });
    expect(await chatOf(placed.messageId)).toBe(threadId);
    expect(await threadsUnder(threadId, placed.messageId)).toEqual([]);
    expect(await threadsUnder(fixture.channelId, placed.messageId)).toEqual([]);
    expect(await orbitFollows(threadId)).toBe(true);
    expect(await settleTarget(placed)).toBe(threadId);
});

test('an inline reply launch keeps its Channel and gets its own work Thread', async () => {
    const parent = await links.humanSend(
        fixture.owner,
        fixture.channelId,
        'Please fix the delivery failure.',
        'place-inline-parent'
    );
    const placed = await launch('#product', 'place-inline', parent.message.id);
    const threadId = threadChatIdForAnchor(placed.messageId);
    expect(placed.receipt).toMatchObject({ chatId: fixture.channelId, target: '#product' });
    expect(await threadsUnder(fixture.channelId, placed.messageId)).toEqual([threadId]);
    expect(await orbitFollows(threadId)).toBe(true);
    expect(await settleTarget(placed)).toBe(fixture.channelId);
});

test('a Task Thread launch posts in the Task Thread and notifies it', async () => {
    const task = await fixture.owner.trpc.task.create.mutate({
        chatId: fixture.channelId,
        content: 'Harden the deploy script',
        nonce: 'place-task',
        serverId: fixture.serverId,
    });
    const threadId = threadChatIdForAnchor(task.task.messageId);
    const target = `#product:${task.task.messageId}`;
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Starting the Thread.',
        nonce: 'place-task-reply',
        serverId: fixture.serverId,
        thread: { anchorMessageId: task.task.messageId },
    });
    const placed = await launch(target, 'place-task-launch');
    expect(placed.receipt).toMatchObject({ chatId: threadId, target });
    expect(await threadsUnder(threadId, placed.messageId)).toEqual([]);
    expect(await orbitFollows(threadId)).toBe(true);
    expect(await settleTarget(placed)).toBe(threadId);
});

test('a launch on an anchor with no Thread is refused and creates nothing', async () => {
    const anchor = await links.humanSend(
        fixture.owner,
        fixture.channelId,
        'Can a cloud agent look at the flaky test?',
        'place-refused-anchor'
    );
    const refused = await refuseLaunch(`#product:${anchor.message.id}`, 'place-refused');
    expect(refused).toEqual({
        code: 'CLOUD_AGENT_NEW_THREAD',
        message: `A cloud agent launch can't open a new thread; its card gets its own work thread. Reply inline instead: --target "#product" --reply-to ${short(anchor.message.id)}`,
    });
    expect(await threadsUnder(fixture.channelId, anchor.message.id)).toEqual([]);
});

test('a launch into a followed Thread with no Messages is refused like no Thread', async () => {
    const anchor = await links.humanSend(
        fixture.owner,
        fixture.channelId,
        'Anyone seen the deploy alarm?',
        'place-empty-anchor'
    );
    const threadId = threadChatIdForAnchor(anchor.message.id);
    // Following an unanswered Message materializes an empty Thread row.
    await fixture.owner.trpc.thread.setFollow.mutate({
        follow: true,
        serverId: fixture.serverId,
        threadChatId: threadId,
    });
    expect(await threadsUnder(fixture.channelId, anchor.message.id)).toEqual([threadId]);
    const refused = await refuseLaunch(`#product:${short(anchor.message.id)}`, 'place-empty');
    expect(refused).toEqual({
        code: 'CLOUD_AGENT_NEW_THREAD',
        message: `A cloud agent launch can't open a new thread; its card gets its own work thread. Reply inline instead: --target "#product" --reply-to ${short(anchor.message.id)}`,
    });
    const [held] = (await fixture.harness.sql`
        select count(*)::int as total from chat_messages where chat_id = ${threadId}
    `) as { total: number }[];
    expect(held?.total).toBe(0);
});

test('a launch on the Agent’s own DM Message with no Thread is refused too', async () => {
    const runner = await fixture.mintRunner('run_place-refused-dm-ack');
    const ack = await links.agentPost(runner, '/api/agent/messages/send', {
        content: 'On it.',
        nonce: 'place-refused-dm-ack',
        target: 'dm:@ada',
    });
    expect(ack.status).toBe(200);
    const ackId = (ack.body as { message: { id: string } }).message.id;
    const refused = await refuseLaunch(`dm:@ada:${short(ackId)}`, 'place-refused-dm');
    expect(refused.message).toEndWith(`--target "dm:@ada" --reply-to ${short(ackId)}`);
    expect(await threadsUnder(await chatOf(ackId), ackId)).toEqual([]);
});

test('a Message send to an anchor with no Thread still opens the Thread', async () => {
    const anchor = await links.humanSend(
        fixture.owner,
        fixture.channelId,
        'What broke the deploy?',
        'place-send-anchor'
    );
    const runner = await fixture.mintRunner('run_place-send-thread');
    await fixture.readTarget(runner, '#product');
    const sent = await links.agentPost(runner, '/api/agent/messages/send', {
        content: 'Looking into it here.',
        nonce: 'place-send-thread',
        target: `#product:${short(anchor.message.id)}`,
    });
    expect(sent.status).toBe(200);
    expect(await threadsUnder(fixture.channelId, anchor.message.id)).toEqual([
        threadChatIdForAnchor(anchor.message.id),
    ]);
});

/** Launches into a target that must be refused, proving no row was written. */
async function refuseLaunch(target: string, nonce: string) {
    const runner = await fixture.mintRunner(`run_${nonce}`);
    await fixture.readTarget(runner, target.split(':').slice(0, -1).join(':'));
    const workBefore = await fixture.countWork();
    const started = await fixture.postStart(runner, fixture.startBody({ nonce, target }));
    expect(started.status).toBe(400);
    expect(await fixture.countWork()).toBe(workBefore);
    const written = (await fixture.harness.sql`
        select id from chat_messages where server_id = ${fixture.serverId} and nonce = ${nonce}
    `) as { id: string }[];
    expect(written).toEqual([]);
    return started.body as { code?: string; message?: string };
}

function short(messageId: string) {
    return messageId.replace(/^msg_/u, '').slice(0, 8);
}

async function launch(target: string, nonce: string, replyToMessageId?: string) {
    const runner = await fixture.mintRunner(`run_${nonce}`);
    await fixture.readTarget(runner, target.split(':')[0] ?? target);
    if (target.includes(':')) {
        await fixture.readTarget(runner, target);
    }
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ nonce, target, ...(replyToMessageId ? { replyToMessageId } : {}) })
    );
    expect(started.status).toBe(200);
    const work = started.body.work as CloudAgentWork;
    expect(work.messageId).toBe(started.body.messageId ?? '');
    return {
        messageId: started.body.messageId as string,
        receipt: started.body,
        runId: started.body.runId as string,
        work,
    };
}

async function chatOf(messageId: string) {
    const [row] = (await fixture.harness.sql`
        select chat_id from chat_messages where id = ${messageId}
    `) as { chat_id: string }[];
    return row?.chat_id;
}

async function threadsUnder(parentChatId: string, anchorMessageId: string) {
    const rows = (await fixture.harness.sql`
        select id from chats
        where parent_chat_id = ${parentChatId} and anchor_message_id = ${anchorMessageId}
    `) as { id: string }[];
    return rows.map((row) => row.id);
}

async function orbitFollows(threadChatId: string) {
    const [row] = (await fixture.harness.sql`
        select followed from agent_thread_follows
        where agent_id = ${fixture.orbitAgentId} and thread_chat_id = ${threadChatId}
    `) as { followed: boolean }[];
    return row?.followed ?? false;
}

/** Settles the Run and returns the Chat its completion notice targeted. */
async function settleTarget(placed: { runId: string; work: CloudAgentWork }) {
    const socket = await fixture.attachComputer();
    await links.observe(socket, {
        observedAt: '2026-10-11T15:00:00.000Z',
        runId: placed.runId,
        status: 'completed',
        workId: placed.work.id,
    });
    socket.close();
    const [row] = (await fixture.harness.sql`
        select chat_id from agent_inbox
        where source = 'cloud_agent_work' and dedupe_key = ${placed.runId}
    `) as { chat_id: string }[];
    return row?.chat_id;
}
