import { expect, test } from 'bun:test';
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

test('a followed Thread is open, titled from its anchor, and waits on the reply', async () => {
    const thread = await anchorWithReply('followed');
    await setFollow(thread.threadChatId, true);

    const row = (await listOpen()).threads.find((t) => t.threadChatId === thread.threadChatId);
    expect(row).toMatchObject({
        group: 'with-agents',
        parentChatId: fixture.channelId,
        state: 'waiting',
        title: '@Blippy followed anchor',
    });
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
