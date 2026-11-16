import type { Locator } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a fully read Thread opens on its newest reply, like a channel', async ({ page }) => {
    test.setTimeout(120_000);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Thread scrolling',
        slug: 'thread-scrolling',
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: 'thread-scrolling',
        token: session.accessToken,
    });
    const root = await client.chat.send.mutate({
        chatId: agent.chatId,
        content: 'Thread anchor',
        nonce: 'thread-scroll-root',
        serverId: server.id,
    });
    const threadTarget = `#all:${root.message.id}`;
    for (let index = 0; index < 16; index += 1) {
        await agent.send(
            `Reply ${index}\n\nA paragraph that gives this Thread enough height to scroll.`,
            `thread-scroll-history-${index}`,
            threadTarget
        );
    }
    // Read every reply, as the viewer would have before coming back to this
    // Thread from the sidebar: no unread reply is left to land on, so nothing
    // overrides the default landing (ADR 0043's unread landing is covered by
    // thread-unread-landing.test.ts, not this spec).
    const { threads } = await client.thread.listUnread.query({ serverId: server.id });
    const unread = threads.find((thread) => thread.anchorMessageId === root.message.id);
    if (unread) {
        await client.chat.markRead.mutate({
            chatId: unread.threadChatId,
            sequence: unread.lastMessageSequence,
            serverId: server.id,
        });
    }
    // A fresh hard navigation straight to a `?thread=` URL, rather than the
    // normal in-app click, re-fetches the whole module graph and is too slow
    // for this suite; open it the way a reader actually does, from the
    // message's own thread preview.
    await openChannel(page, 'all');
    await page.getByRole('button', { name: /^Open thread, \d+ repl/ }).click();
    const viewport = page.getByTestId('thread-conversation');
    await expect(viewport.getByText('Reply 15', { exact: true })).toBeAttached();
    await expect
        .poll(() => viewport.evaluate((node) => node.scrollHeight - node.clientHeight))
        .toBeGreaterThan(400);
    // Opens on the newest reply, like a channel or DM, not the anchor at the top.
    await atBottom(viewport);
    await expect(viewport.getByText('Reply 15', { exact: true })).toBeInViewport();
    const jump = page.getByRole('button', { name: 'Jump to latest reply' });

    await agent.send('Reply while following', 'thread-scroll-follow', threadTarget);
    await expect(viewport.getByText('Reply while following', { exact: true })).toBeInViewport();
    await atBottom(viewport);

    await viewport.hover();
    await page.mouse.wheel(0, -500);
    await expect.poll(() => distanceFromEnd(viewport)).toBeGreaterThan(300);
    await expect(jump).toBeVisible();
    const readingTop = await viewport.evaluate((node) => node.scrollTop);
    await agent.send('Reply while reading history', 'thread-scroll-history', threadTarget);
    await expect(viewport.getByText('Reply while reading history')).toBeAttached();
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeCloseTo(readingTop, 0);

    await jump.click();
    await atBottom(viewport);
});

async function distanceFromEnd(viewport: Locator) {
    return await viewport.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop
    );
}

async function atBottom(viewport: Locator) {
    await expect.poll(() => distanceFromEnd(viewport)).toBeLessThanOrEqual(8);
}
