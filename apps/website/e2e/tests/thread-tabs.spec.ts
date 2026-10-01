import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Threads open in the side pane, one preview at a time', async ({ page }, testInfo) => {
    await installDesktopBrowserStub(page);
    const { client, server } = await createTestServer(page, {
        displayName: 'Thread tabs',
        slug: 'thread-tabs',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    const roots: string[] = [];
    for (const name of ['First', 'Second', 'Third']) {
        const sent = await client.chat.send.mutate({
            serverId: server.id,
            chatId,
            nonce: `thread-root-${name}`,
            content: `${name} thread root`,
        });
        roots.push(sent.message.id);
    }
    for (const [index, name] of ['First', 'Second'].entries()) {
        await client.chat.send.mutate({
            serverId: server.id,
            chatId,
            nonce: `thread-reply-${name}`,
            content: `${name} thread reply`,
            thread: { anchorMessageId: roots[index] ?? '' },
        });
    }
    // The desktop shell routes by hash, so the Server's path alone does not select it.
    await page.goto(`/#/s/thread-tabs/chats/${chatId}`);
    const sidePane = page.getByRole('complementary', { name: 'Side pane' });
    const sideTabs = page
        .getByRole('navigation', { name: 'Side pane tabs' })
        .locator('.workspace-tab');
    const preview = page.locator('.workspace-band-trail .workspace-tab--preview');
    const openThread = page.getByRole('button', { name: 'Open thread, 1 reply' });

    // A Thread opens in the side pane as its preview tab, beside the chat.
    await openThread.first().click();
    await expect(sideTabs).toHaveCount(1);
    await expect(preview).toContainText('First thread root');
    await expect(sidePane.getByText('First thread reply', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    expect(page.url()).not.toContain('thread=');

    // The next Thread replaces the preview in place instead of stacking.
    await openThread.nth(1).click();
    await expect(sideTabs).toHaveCount(1);
    await expect(preview).toContainText('Second thread root');

    // Double-clicking pins it; the next Thread then opens beside it.
    await sideTabs
        .first()
        .getByRole('button', { name: 'Second thread root', exact: true })
        .dblclick();
    await expect(preview).toHaveCount(0);
    await openThread.first().click();
    await expect(sideTabs).toHaveCount(2);
    await expect(preview).toContainText('First thread root');

    // Replying pins the preview tab.
    const reply = sidePane.getByRole('textbox', { name: /Message Thread/u });
    await reply.fill('Pinned by this reply');
    await reply.press('Enter');
    await expect(sidePane.getByText('Pinned by this reply', { exact: true })).toBeVisible();
    await expect(preview).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('thread-tabs.png') });

    // The tab closes the Thread, so its header has no second close button. View in chat
    // reveals the anchor in the chat's own transcript, flashing it.
    await expect(sidePane.getByRole('button', { name: 'Close thread' })).toHaveCount(0);
    await sidePane.getByRole('button', { name: /thread actions$/u }).click();
    await page.getByRole('menuitem', { name: 'View in chat' }).click();
    await expect(
        page.getByLabel('Messages', { exact: true }).locator(`[data-message-id="${roots[0]}"]`)
    ).toHaveClass(/chat-thread-flash/u);

    // A `?thread=` link (a same-document hash navigation here) opens the Thread's tab
    // and leaves the URL; the routed navigation leaves the side pane showing.
    await page.goto(`/#/s/thread-tabs/chats/${chatId}?thread=${roots[2]}`);
    await expect(preview).toContainText('Third thread root');
    await expect(sideTabs).toHaveCount(3);
    await expect.poll(() => page.url()).not.toContain('thread=');

    // Pinned Threads persist; the preview does not, and the pane comes back hidden.
    await page.reload();
    await expect(sidePane).toHaveCount(0);
    await expect(page.locator('.workspace-band-trail .badge')).toHaveText('2');
    await page.getByRole('button', { name: 'Show tabs', exact: true }).click();
    await expect(sideTabs).toHaveCount(2);
    await expect(
        page.getByRole('navigation', { name: 'Side pane tabs' }).getByRole('button', {
            name: 'First thread root',
            exact: true,
        })
    ).toBeVisible();
    await expect(
        page.getByRole('navigation', { name: 'Side pane tabs' }).getByRole('button', {
            name: 'Third thread root',
            exact: true,
        })
    ).toHaveCount(0);
});
