import { afterAll, beforeAll, expect, test } from 'bun:test';
import { taskInboxListSchema } from '@haus/api';
import { countUnreadInboxRows } from '../src/chats/unread-chat-count.ts';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { collectStream } from './realtime-stream.ts';

/** The person Task Inbox (ADR 0051 decision 5): list, clear, restore, the badge, the stream. */
let fixture: NotificationFixture;
let boardId: string;
let columns: Record<string, string>;

beforeAll(async () => {
    fixture = await startNotificationFixture();
    const [general] = await fixture.owner.trpc.board.list.query({ serverId: fixture.serverId });
    boardId = general?.id ?? '';
    columns = Object.fromEntries(
        (general?.columns ?? []).map((column) => [column.category, column.id])
    );
});

afterAll(async () => {
    await fixture.close();
});

function assignToPeer(title: string) {
    const { owner, peerUserId, serverId } = fixture;
    return owner.trpc.task.create.mutate({
        assignee: { kind: 'user', userId: peerUserId },
        boardId,
        serverId,
        title,
    });
}

const items = async () =>
    (await fixture.peer.trpc.taskInbox.list.query({ serverId: fixture.serverId })).items;
const badge = async () => (await fixture.peer.trpc.chat.unreadChatCount.query()).count;

test('an assignment lists newest first with its assigner and board, one item per Task', async () => {
    const { ownerUserId } = fixture;
    const older = await assignToPeer('Older');
    const newer = await assignToPeer('Newer');
    const listed = await items();
    expect(taskInboxListSchema.parse({ items: listed }).items).toHaveLength(2);
    expect(listed.map((item) => item.task.id)).toEqual([newer.task.id, older.task.id]);
    expect(listed[0]).toMatchObject({
        assignedBy: { id: ownerUserId, kind: 'user', label: 'Ada' },
        boardName: 'General',
        contextMessage: null,
        contextPlace: null,
        task: { key: newer.task.key, title: 'Newer' },
    });
    await Promise.all(
        [older, newer].map(({ task }) =>
            fixture.peer.trpc.taskInbox.clear.mutate({
                serverId: fixture.serverId,
                taskId: task.id,
            })
        )
    );
});

test('the context message is the newest reference the reader can read', async () => {
    const { createChannel, owner, peer, serverId } = fixture;
    const { task } = await assignToPeer('Discussed');
    const channelId = await createChannel('task-inbox-context');
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `Where is ${task.key}?`,
        nonce: 'inbox-context-first',
        serverId,
    });
    const second = await peer.trpc.chat.send.mutate({
        chatId: channelId,
        content: `${task.key} is next.`,
        nonce: 'inbox-context-second',
        serverId,
    });
    // Cass and Ada's DM is newer, but Bo cannot read it.
    const dmId = (
        await owner.trpc.chat.ensureDm.mutate({
            peerUserId: (await readUserId('user_notify_outsider')) ?? '',
            serverId,
        })
    ).id;
    await owner.trpc.chat.send.mutate({
        chatId: dmId,
        content: `Keep ${task.key} between us.`,
        nonce: 'inbox-context-private',
        serverId,
    });

    const [item] = await items();
    expect(item?.contextMessage).toMatchObject({
        chatId: channelId,
        content: `${task.key} is next.`,
        id: second.message.id,
        taskLinks: [{ key: task.key, taskId: task.id, text: task.key }],
    });
    expect(item?.contextPlace).toEqual({
        chatId: channelId,
        chatKind: 'channel',
        chatName: 'task-inbox-context',
        threadAnchorMessageId: null,
    });
    await peer.trpc.taskInbox.clear.mutate({ serverId, taskId: task.id });
});

test('a context message in a Thread names the Channel and anchor, and a DM names no peer', async () => {
    const { createChannel, owner, peer, peerUserId, serverId } = fixture;
    const { task } = await assignToPeer('Threaded');
    const channelId = await createChannel('task-inbox-thread');
    const anchor = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: 'Rotation plan',
        nonce: 'inbox-thread-anchor',
        serverId,
    });
    const reply = await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `${task.key} is the first step.`,
        nonce: 'inbox-thread-reply',
        serverId,
        thread: { anchorMessageId: anchor.message.id },
    });

    const [threaded] = await items();
    expect(threaded?.contextMessage?.chatId).toBe(reply.message.chatId);
    expect(threaded?.contextPlace).toEqual({
        chatId: channelId,
        chatKind: 'channel',
        chatName: 'task-inbox-thread',
        threadAnchorMessageId: anchor.message.id,
    });
    const detail = await peer.trpc.task.get.query({ serverId, taskId: task.id });
    expect(detail.mentions).toEqual([
        expect.objectContaining({
            chatId: reply.message.chatId,
            messageId: reply.message.id,
            place: threaded?.contextPlace,
        }),
    ]);

    const dmId = (await owner.trpc.chat.ensureDm.mutate({ peerUserId, serverId })).id;
    await owner.trpc.chat.send.mutate({
        chatId: dmId,
        content: `Ping on ${task.key}.`,
        nonce: 'inbox-thread-dm',
        serverId,
    });
    const [direct] = await items();
    expect(direct?.contextPlace).toEqual({
        chatId: dmId,
        chatKind: 'dm',
        chatName: null,
        threadAnchorMessageId: null,
    });
    await peer.trpc.taskInbox.clear.mutate({ serverId, taskId: task.id });
});

test('clear, restore, the assignee moving it, and reassigning away each change the item', async () => {
    const { owner, ownerUserId, peer, serverId } = fixture;
    const before = await badge();
    const { task } = await assignToPeer('Lifecycle');
    expect(await badge()).toBe(before + 1);
    expect(await countUnreadInboxRows(fixture.database.db, fixture.peerUserId)).toBe(before + 1);

    const input = { serverId, taskId: task.id };
    await expect(peer.trpc.taskInbox.clear.mutate(input)).resolves.toEqual({ changed: true });
    await expect(peer.trpc.taskInbox.clear.mutate(input)).resolves.toEqual({ changed: false });
    expect(await items()).toEqual([]);
    expect(await badge()).toBe(before);

    await expect(peer.trpc.taskInbox.restore.mutate(input)).resolves.toEqual({ changed: true });
    await expect(peer.trpc.taskInbox.restore.mutate(input)).resolves.toEqual({ changed: false });
    expect((await items()).map((item) => item.task.id)).toEqual([task.id]);

    // Someone else moving the Task leaves the item; the assignee moving it clears it.
    await owner.trpc.task.move.mutate({
        columnId: columns.backlog ?? '',
        expectedVersion: 1,
        ...input,
    });
    expect(await items()).toHaveLength(1);
    await peer.trpc.task.move.mutate({
        columnId: columns.active ?? '',
        expectedVersion: 2,
        ...input,
    });
    expect(await items()).toEqual([]);

    await peer.trpc.taskInbox.restore.mutate(input);
    await owner.trpc.task.assign.mutate({
        assignee: { kind: 'user', userId: ownerUserId },
        expectedVersion: 3,
        ...input,
    });
    expect(await items()).toEqual([]);
    await expect(peer.trpc.taskInbox.restore.mutate(input)).resolves.toEqual({ changed: false });
    expect(await badge()).toBe(before);
});

test('only a member of the Server touches its Task Inbox', async () => {
    const { serverId } = fixture;
    const stranger = await fixture.signIn('user_task_inbox_stranger', ['dee@haus.test']);
    await expect(stranger.trpc.taskInbox.list.query({ serverId })).rejects.toThrow();
    await expect(
        stranger.trpc.taskInbox.clear.mutate({ serverId, taskId: 'tsk_missing' })
    ).rejects.toThrow();
    stranger.close();
});

test('taskInbox.onChanged reaches only the person whose items changed', async () => {
    const { owner, peer, serverId } = fixture;
    const peerStream = collectStream(peer.trpc.taskInbox.onChanged, { serverId });
    const ownerStream = collectStream(owner.trpc.taskInbox.onChanged, { serverId });
    await Promise.all([peerStream.started, ownerStream.started]);

    const { task } = await assignToPeer('Streamed');
    await expect(peerStream.next()).resolves.toEqual({ serverId, userId: fixture.peerUserId });
    await peer.trpc.taskInbox.clear.mutate({ serverId, taskId: task.id });
    await expect(peerStream.next()).resolves.toEqual({ serverId, userId: fixture.peerUserId });
    expect(ownerStream.events).toEqual([]);
    peerStream.stop();
    ownerStream.stop();
});

async function readUserId(subject: string) {
    const [row] = (await fixture.harness.sql`
        select id from users where auth_subject = ${subject}
    `) as { id: string }[];
    return row?.id;
}
