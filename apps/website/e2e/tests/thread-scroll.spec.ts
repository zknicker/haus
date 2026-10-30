import type { Locator } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a Thread opens on its anchor and follows incoming replies only from the bottom', async ({
    page,
}) => {
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
        token: session.token,
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

    await page.goto(`/s/thread-scrolling/chats/${agent.chatId}?thread=${root.message.id}`);
    const viewport = page.getByTestId('thread-conversation');
    await expect(viewport.getByText('Reply 15', { exact: true })).toBeAttached();
    await expect
        .poll(() => viewport.evaluate((node) => node.scrollHeight - node.clientHeight))
        .toBeGreaterThan(400);
    // Opens on the anchor and stays there as the replies load in under it.
    await page.waitForTimeout(500);
    expect(await viewport.evaluate((node) => node.scrollTop)).toBeLessThanOrEqual(8);
    const jump = page.getByRole('button', { name: 'Jump to latest reply' });
    await expect(jump).toBeVisible();
    await agent.send('Reply while reading the anchor', 'thread-scroll-top', threadTarget);
    await expect(viewport.getByText('Reply while reading the anchor')).toBeAttached();
    expect(await viewport.evaluate((node) => node.scrollTop)).toBeLessThanOrEqual(8);

    await jump.click();
    await atBottom(viewport);
    await agent.send('Reply while following', 'thread-scroll-follow', threadTarget);
    await expect(viewport.getByText('Reply while following', { exact: true })).toBeInViewport();
    await atBottom(viewport);

    await viewport.hover();
    await page.mouse.wheel(0, -500);
    await expect.poll(() => distanceFromEnd(viewport)).toBeGreaterThan(300);
    const readingTop = await viewport.evaluate((node) => node.scrollTop);
    await agent.send('Reply while reading history', 'thread-scroll-history', threadTarget);
    await expect(viewport.getByText('Reply while reading history')).toBeAttached();
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeCloseTo(readingTop, 0);
});

async function distanceFromEnd(viewport: Locator) {
    return await viewport.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop
    );
}

async function atBottom(viewport: Locator) {
    await expect.poll(() => distanceFromEnd(viewport)).toBeLessThanOrEqual(8);
}
