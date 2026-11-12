import { expect, test } from 'bun:test';
import { isOpenThreadInSidebar } from '@haus/api';
import { threadChatIdForAnchor } from '../src/threads/thread-id.ts';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

async function anchorWithReply(name: string) {
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: `[@Blippy](agent://agt_x) ${name} anchor\nsecond line`,
        nonce: `${name}-anchor`,
        serverId: fixture.serverId,
    });
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: `${name} reply`,
        nonce: `${name}-reply`,
        serverId: fixture.serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    return {
        anchorMessageId: anchor.message.id,
        threadChatId: threadChatIdForAnchor(anchor.message.id),
    };
}

const listOpen = () => fixture.owner.trpc.thread.listOpen.query({ serverId: fixture.serverId });
const setFollow = (threadChatId: string, follow: boolean) =>
    fixture.owner.trpc.thread.setFollow.mutate({
        follow,
        serverId: fixture.serverId,
        threadChatId,
    });

test('a Thread the viewer wrote in is active, titled from its anchor, whoever wrote last', async () => {
    const thread = await anchorWithReply('followed');
    await setFollow(thread.threadChatId, true);

    const row = (await listOpen()).threads.find((t) => t.threadChatId === thread.threadChatId);
    expect(row).toMatchObject({
        group: 'recent',
        parentChatId: fixture.channelId,
        state: 'active',
        title: '@Blippy followed anchor',
        viewerTookPart: true,
    });
    expect(row && isOpenThreadInSidebar(row)).toBe(true);
});

test('a reply the viewer has read keeps a Thread they took part in active', async () => {
    const thread = await anchorWithReply('read-reply');
    const reply = await fixture.peer.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Done, shipped it.',
        nonce: 'read-reply-peer',
        serverId: fixture.serverId,
        thread: { anchorMessageId: thread.anchorMessageId },
    });
    const unread = (await listOpen()).threads.find((t) => t.threadChatId === thread.threadChatId);
    expect(unread).toMatchObject({ actorName: 'Bo', state: 'unread', viewerTookPart: true });
    expect(unread && isOpenThreadInSidebar(unread)).toBe(true);

    await fixture.owner.trpc.chat.markRead.mutate({
        chatId: thread.threadChatId,
        sequence: reply.message.sequence,
        serverId: fixture.serverId,
    });
    const read = (await listOpen()).threads.find((t) => t.threadChatId === thread.threadChatId);
    expect(read).toMatchObject({ actorName: 'Bo', state: 'active' });
});

test('a followed conversation the viewer never touched stays off the sidebar', async () => {
    const anchor = await fixture.peer.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: '🎄 Thursday best-sellers watch',
        nonce: 'untouched-anchor',
        serverId: fixture.serverId,
    });
    const reply = await fixture.peer.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Numbers are in.',
        nonce: 'untouched-reply',
        serverId: fixture.serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = threadChatIdForAnchor(anchor.message.id);
    await setFollow(threadChatId, true);

    const unread = (await listOpen()).threads.find((t) => t.threadChatId === threadChatId);
    expect(unread).toMatchObject({
        state: 'unread',
        title: 'Thursday best-sellers watch',
        viewerTookPart: false,
    });
    expect(unread && isOpenThreadInSidebar(unread)).toBe(false);

    await fixture.owner.trpc.chat.markRead.mutate({
        chatId: threadChatId,
        sequence: reply.message.sequence,
        serverId: fixture.serverId,
    });
    const read = (await listOpen()).threads.find((t) => t.threadChatId === threadChatId);
    expect(read).toMatchObject({ state: 'recent', viewerTookPart: false });
    expect(read && isOpenThreadInSidebar(read)).toBe(false);
});

test('a mention in the anchor counts as taking part', async () => {
    const anchor = await fixture.peer.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: `[@Ada](user://${fixture.ownerUserId}) can you look?`,
        nonce: 'mentioned-anchor',
        serverId: fixture.serverId,
    });
    await fixture.peer.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Details here.',
        nonce: 'mentioned-reply',
        serverId: fixture.serverId,
        thread: { anchorMessageId: anchor.message.id },
    });
    const threadChatId = threadChatIdForAnchor(anchor.message.id);
    await setFollow(threadChatId, true);

    const row = (await listOpen()).threads.find((t) => t.threadChatId === threadChatId);
    expect(row).toMatchObject({ viewerTookPart: true });
});

test('Close files a Thread under Earlier until someone else writes', async () => {
    const thread = await anchorWithReply('closing');
    await setFollow(thread.threadChatId, true);
    await fixture.owner.trpc.thread.setClosed.mutate({
        closed: true,
        serverId: fixture.serverId,
        threadChatId: thread.threadChatId,
    });

    const closed = await listOpen();
    expect(closed.closedThreadChatIds).toContain(thread.threadChatId);
    expect(closed.threads.map((t) => t.threadChatId)).not.toContain(thread.threadChatId);
    const earlier = await fixture.owner.trpc.thread.listEarlier.query({
        scope: 'following',
        serverId: fixture.serverId,
    });
    expect(earlier.threads.map((t) => t.threadChatId)).toContain(thread.threadChatId);

    // The closer's own later Message does not reopen it.
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'one more thing',
        nonce: 'closing-own',
        serverId: fixture.serverId,
        thread: { anchorMessageId: thread.anchorMessageId },
    });
    expect((await listOpen()).closedThreadChatIds).toContain(thread.threadChatId);

    await fixture.owner.trpc.thread.setClosed.mutate({
        closed: false,
        serverId: fixture.serverId,
        threadChatId: thread.threadChatId,
    });
    expect((await listOpen()).closedThreadChatIds).not.toContain(thread.threadChatId);
});

test('a Thread on a work card is open without a follow, until unfollowed', async () => {
    const runner = await fixture.mintRunner('run_open_thread_work');
    await fixture.readTarget(runner, '#product');
    const started = await fixture.postStart(runner, fixture.startBody({ nonce: 'open-work' }));
    const messageId = (started.body.work as { messageId: string }).messageId;
    const threadChatId = threadChatIdForAnchor(messageId);
    await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'watching this',
        nonce: 'open-work-reply',
        serverId: fixture.serverId,
        thread: { anchorMessageId: messageId },
    });
    await fixture.harness.sql`delete from thread_follows where thread_chat_id = ${threadChatId}`;

    const row = (await listOpen()).threads.find((t) => t.threadChatId === threadChatId);
    expect(row).toMatchObject({ jobCount: 1, liveJobCount: 1, state: 'working' });

    const workId = (started.body.work as { id: string }).id;
    expect(
        await fixture.owner.trpc.cloudAgentWork.listLinks.query({
            serverId: fixture.serverId,
            workIds: [workId],
        })
    ).toEqual([{ anchorMessageId: null, chatId: fixture.channelId, workId }]);

    await setFollow(threadChatId, false);
    expect((await listOpen()).threads.map((t) => t.threadChatId)).not.toContain(threadChatId);
});
