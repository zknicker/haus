import {
    installDesktopBrowserStub,
    moveTabToRightPane,
    openDesktopWindow,
} from '../support/desktop-browser-stub.ts';
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
    // Links open in the other pane only once a second pane exists: split off an Inbox tab.
    await page.getByRole('row', { exact: true, name: 'Inbox' }).click({ modifiers: ['Meta'] });
    await moveTabToRightPane(page, 'Inbox');
    const threadPane = page.locator('.desktop-tab-frame[data-frame-pane="secondary"]:visible');
    const right = page
        .getByRole('navigation', { name: 'Right pane tabs', exact: true })
        .locator('.workspace-tab');
    const openThread = page.getByRole('button', { name: 'Open thread, 1 reply' });

    // A Thread opens as a page in the other pane, beside the chat, and leaves the URL alone.
    await openThread.first().click();
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText('First thread root');
    await expect(threadPane.getByText('First thread reply', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    expect(page.url()).not.toContain('thread=');

    // Another Thread navigates that pane's tab (its history keeps the first); opening a
    // Thread already shown there keeps the one tab.
    await openThread.nth(1).click();
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText('Second thread root');
    await expect(threadPane.getByText('Second thread reply', { exact: true })).toBeVisible();
    await openThread.first().click();
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText('First thread root');

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

    // The Thread tab survives a reload with its page.
    await page.reload();
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText('First thread root');
});
