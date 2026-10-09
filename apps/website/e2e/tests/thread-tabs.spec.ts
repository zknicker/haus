import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Threads open as pages in the other pane beside the chat', async ({ page }, testInfo) => {
    await installDesktopBrowserStub(page);
    const { client, server } = await createTestServer(page, {
        displayName: 'Thread tabs',
        slug: 'thread-tabs',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    const roots: string[] = [];
    for (const name of ['First', 'Second']) {
        const sent = await client.chat.send.mutate({
            serverId: server.id,
            chatId,
            nonce: `thread-root-${name}`,
            content: `${name} thread root`,
        });
        roots.push(sent.message.id);
        await client.chat.send.mutate({
            serverId: server.id,
            chatId,
            nonce: `thread-reply-${name}`,
            content: `${name} thread reply`,
            thread: { anchorMessageId: sent.message.id },
        });
    }
    await openDesktopWindow(page, `/s/thread-tabs/chats/${chatId}`);
    const threadPane = page.locator('.desktop-tab-frame[data-frame-pane="secondary"]:visible');
    const right = page
        .getByRole('navigation', { name: 'Right pane tabs', exact: true })
        .locator('.workspace-tab');
    const openThread = page.getByRole('button', { name: 'Open thread, 1 reply' });

    // A Thread opens as a new tab in the right pane, creating it beside the chat (ADR 0039,
    // amended 2026-10-08), and leaves the URL alone.
    await openThread.first().click();
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText('First thread root');
    await expect(threadPane.getByText('First thread reply', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    expect(page.url()).not.toContain('thread=');

    // Another Thread opens its own tab there; opening a Thread that already has a tab selects it.
    await openThread.nth(1).click();
    await expect(right).toHaveCount(2);
    await expect(right.nth(1)).toContainText('Second thread root');
    await expect(threadPane.getByText('Second thread reply', { exact: true })).toBeVisible();
    await openThread.first().click();
    await expect(right).toHaveCount(2);
    await expect(threadPane.getByText('First thread reply', { exact: true })).toBeVisible();

    // Replying from the Thread page posts into the Thread.
    const reply = threadPane.getByRole('textbox', { name: /Message Thread/u });
    await reply.fill('Sent from the Thread page');
    await reply.press('Enter');
    await expect(threadPane.getByText('Sent from the Thread page', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('thread-tabs.png') });

    // View in chat reveals the anchor in the chat's own transcript, flashing it.
    await threadPane.getByRole('button', { name: /thread actions$/u }).click();
    await page.getByRole('menuitem', { name: 'View in chat' }).click();
    await expect(
        page.getByLabel('Messages', { exact: true }).locator(`[data-message-id="${roots[0]}"]`)
    ).toHaveClass(/chat-thread-flash/u);

    // The Thread tabs survive a reload with their pages.
    await page.reload();
    await expect(right).toHaveCount(2);
    await expect(right.first()).toContainText('First thread root');
});
