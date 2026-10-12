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
