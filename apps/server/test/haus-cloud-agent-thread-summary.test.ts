import { expect, test } from 'bun:test';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

// The anchor's preview states Thread work once, as its work summary, so the
// reply tail carries only conversation and a fan-out never crowds it out.
test('a Thread summary previews conversational replies and leaves out work announcements', async () => {
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Run the health standard on every repo.',
        nonce: 'summary-anchor',
        serverId: fixture.serverId,
    });
    const reply = (content: string) =>
        fixture.owner.trpc.chat.send.mutate({
            chatId: fixture.channelId,
            content,
            nonce: `summary-${content}`,
            serverId: fixture.serverId,
            thread: { anchorMessageId: anchor.message.id },
        });
    const runner = await fixture.mintRunner('run_cloud_thread_summary');

    await reply('first');
    await reply('second');
    for (const repo of ['one', 'two', 'three']) {
        const started = await fixture.postStart(
            runner,
            fixture.startBody({
                nonce: `summary-work-${repo}`,
                target: `#product:${anchor.message.id}`,
                title: `Health standard: ${repo}`,
            })
        );
        expect(started.status).toBe(200);
    }
    await reply('third');

    const { threads } = await fixture.owner.trpc.chat.messages.query({
        chatId: fixture.channelId,
        serverId: fixture.serverId,
    });
    const summary = threads.find((thread) => thread.anchorMessageId === anchor.message.id);

    // Counts still include the announcements; only the preview tail skips them.
    expect(summary?.replyCount).toBe(6);
    expect(summary?.recentReplies.map((recent) => recent.content)).toEqual([
        'first',
        'second',
        'third',
    ]);
});
