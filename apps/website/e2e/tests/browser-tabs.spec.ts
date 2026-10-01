import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('browser tabs preserve the chat draft, channel menu, and sidebar navigation', async ({
    page,
}, testInfo) => {
    await installDesktopBrowserStub(page);
    const { client, server } = await createTestServer(page, {
        displayName: 'Browser tabs',
        slug: 'browser-tabs',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    await client.chat.send.mutate({
        serverId: server.id,
        chatId,
        nonce: 'browser-link',
        content: '[Amazon listing](https://www.amazon.com/dp/B012345678)',
    });
    await openChannel(page, 'all');
    const composer = page.getByRole('textbox', { name: 'Message all' });
    await composer.fill('Keep this draft');
    await page.getByRole('link', { name: 'Open B012345678 on Amazon' }).click();
    // At rest the address shows the condensed label: no scheme, `www.`, or query.
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toHaveValue(
        'amazon.com/dp/B012345678'
    );
    const primaryTab = page.locator('.workspace-primary-tab');
    const inactiveBounds = await primaryTab.boundingBox();
    await page.keyboard.press('Meta+l');
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toBeFocused();
    await page.keyboard.press('Control+Shift+Tab');
    await expect(composer).toHaveText('Keep this draft');
    const activeBounds = await primaryTab.boundingBox();
    expect(activeBounds?.width).toBe(inactiveBounds?.width);
    // The Band layout's 240px basis: a short name like "all" does not shrink the primary tab.
    expect(activeBounds?.width).toBe(240);
    expect(activeBounds?.height).toBe(inactiveBounds?.height);
    expect(await primaryTab.evaluate((node) => getComputedStyle(node).borderRadius)).not.toBe(
        '0px'
    );
    await expect(page.getByRole('button', { name: 'Show artifacts' })).toHaveCount(0);
    await page.keyboard.press('Control+Tab');
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toBeVisible();
    const titlebar = await page.locator('.workspace-titlebar').boundingBox();
    const sidebar = await page
        .getByRole('complementary', { name: 'Server' })
        .boundingBox()
        .catch(() => null);
    expect(titlebar?.y).toBe(0);
    expect(titlebar?.x).toBeGreaterThan(0);
    expect(titlebar?.width).toBeLessThan(page.viewportSize()?.width ?? 1280);
    // The window band spans the window; the sidebar starts below it.
    if (sidebar && titlebar) {
        expect(sidebar.y).toBeGreaterThanOrEqual(titlebar.y + titlebar.height);
    }
    const chatUrl = page.url();
    await page.evaluate(() => window.dispatchEvent(new Event('test:desktop-history')));
    await expect(page.locator('html')).toHaveAttribute('data-browser-history', 'back');
    expect(page.url()).toBe(chatUrl);
    await expect(composer).toHaveCount(0);
    await page.getByRole('button', { name: 'all', exact: true }).click();
    await expect(composer).toHaveText('Keep this draft');
    const composerBounds = await composer.boundingBox();
    expect(composerBounds?.y).toBeGreaterThan((page.viewportSize()?.height ?? 720) - 90);
    await page.screenshot({ path: testInfo.outputPath('workspace-tabs.png') });
    // The chat's actions menu sits at the band's end, not inside the primary tab.
    await expect(primaryTab.getByRole('button', { name: /channel actions/ })).toHaveCount(0);
    await page
        .locator('.workspace-band-actions')
        .getByRole('button', { name: /all.*channel actions/ })
        .click();
    await expect(page.getByRole('menuitem', { name: 'Rename channel' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'www.amazon.com', exact: true }).click();
    await openChannel(page, 'all');
    await expect(composer).toHaveText('Keep this draft');
    await page.getByRole('button', { name: 'New browser tab' }).click();
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toBeFocused();
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toHaveValue('');
    await page
        .getByRole('combobox', { name: 'Page address', exact: true })
        .fill('https://www.amazon.com/dp/B012345');
    // Typing puts "Go to" first, highlighted, with matching history below it.
    await expect(
        page.getByRole('option', { name: 'Go to https://www.amazon.com/dp/B012345', exact: true })
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'www.amazon.com', exact: true })).toHaveCount(2);
    await page.getByRole('combobox', { name: 'Page address' }).fill('Amazon');
    await expect(page.getByRole('option', { name: /B012345678/ })).toBeVisible();
    await page.getByRole('option', { name: /B012345678/ }).click();
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toHaveValue(
        'amazon.com/dp/B012345678'
    );
    await page.getByRole('button', { name: 'New browser tab' }).click();
    await page
        .getByRole('combobox', { name: 'Page address', exact: true })
        .fill('Haus browser tabs');
    await page.getByRole('combobox', { name: 'Page address', exact: true }).press('Enter');
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toHaveValue(
        'google.com/search'
    );
    // The strip holds every tab: the primary tab leads, then two Amazon tabs and Google.
    const browserTabs = page.getByRole('navigation', { name: 'Workspace tabs' });
    const google = browserTabs.getByRole('button', { name: 'www.google.com', exact: true });
    const initialGoogleX = (await google.boundingBox())?.x ?? 0;
    await google.focus();
    await google.press('Space');
    await expect(browserTabs.locator('.workspace-tab[data-dragging="true"]')).toHaveCount(1);
    await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    );
    await google.press('ArrowLeft');
    await expect
        .poll(async () => (await google.boundingBox())?.x ?? 0)
        .toBeLessThan(initialGoogleX);
    await google.press('Space');
    await expect(browserTabs.locator('.workspace-tab').nth(2)).toContainText('www.google.com');
    const googleBounds = await google.boundingBox();
    const firstBounds = await browserTabs.locator('.workspace-tab').first().boundingBox();
    expect(googleBounds).not.toBeNull();
    expect(firstBounds).not.toBeNull();
    if (googleBounds && firstBounds) {
        await page.mouse.move(
            googleBounds.x + googleBounds.width / 2,
            googleBounds.y + googleBounds.height / 2
        );
        await page.mouse.down();
        await page.mouse.move(
            firstBounds.x + firstBounds.width / 2,
            firstBounds.y + firstBounds.height / 2,
            { steps: 20 }
        );
        await page.mouse.up();
    }
    // Dropped on the primary tab, Google moves before it: nothing is pinned first.
    await expect(browserTabs.locator('.workspace-tab').first()).toContainText('www.google.com');
    await expect(browserTabs.locator('.workspace-tab').nth(1)).toHaveClass(/workspace-primary-tab/);
    await page.getByRole('button', { name: 'Close www.google.com' }).press('Enter');
    await expect(page.getByRole('button', { name: 'Close www.google.com' })).toHaveCount(0);
    await page.getByRole('button', { name: 'New browser tab' }).click();
    await page.getByRole('button', { name: 'Close New tab' }).click();
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toHaveValue(
        'amazon.com/dp/B012345678'
    );
    while (await page.getByRole('button', { name: 'Close www.amazon.com' }).count()) {
        await page.getByRole('button', { name: 'Close www.amazon.com' }).first().click();
    }
    await expect(composer).toHaveText('Keep this draft');
    await expect(page.getByRole('combobox', { name: 'Page address', exact: true })).toHaveCount(0);
});

test('Threads open as companion tabs in the split, one preview at a time', async ({
    page,
}, testInfo) => {
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
    const split = page.getByRole('complementary', { name: 'Split view' });
    const splitTabs = split.locator('.workspace-tab');
    const preview = split.locator('.workspace-tab--preview');
    const openThread = page.getByRole('button', { name: 'Open thread, 1 reply' });

    // A companion opens the closed split, as its preview tab, beside the chat.
    await openThread.first().click();
    await expect(splitTabs).toHaveCount(1);
    await expect(preview).toContainText('First thread root');
    await expect(split.getByText('First thread reply', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    expect(page.url()).not.toContain('thread=');

    // The next companion replaces the preview in place instead of stacking.
    await openThread.nth(1).click();
    await expect(splitTabs).toHaveCount(1);
    await expect(preview).toContainText('Second thread root');

    // Double-clicking pins it; the next companion then opens beside it.
    await splitTabs
        .first()
        .getByRole('button', { name: 'Second thread root', exact: true })
        .dblclick();
    await expect(preview).toHaveCount(0);
    await openThread.first().click();
    await expect(splitTabs).toHaveCount(2);
    await expect(preview).toContainText('First thread root');

    // Replying pins the preview tab.
    const reply = split.getByRole('textbox', { name: /Message Thread/u });
    await reply.fill('Pinned by this reply');
    await reply.press('Enter');
    await expect(split.getByText('Pinned by this reply', { exact: true })).toBeVisible();
    await expect(preview).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('thread-tabs.png') });

    // The tab closes the Thread, so its header has no second close button. View in chat
    // reveals the anchor in the chat's own transcript, flashing it.
    await expect(split.getByRole('button', { name: 'Close thread' })).toHaveCount(0);
    await split.getByRole('button', { name: /thread actions$/u }).click();
    await page.getByRole('menuitem', { name: 'View in chat' }).click();
    await expect(
        page.getByLabel('Messages', { exact: true }).locator(`[data-message-id="${roots[0]}"]`)
    ).toHaveClass(/chat-thread-flash/u);

    // A `?thread=` link (a same-document hash navigation here) opens the Thread's tab
    // and leaves the URL.
    await page.goto(`/#/s/thread-tabs/chats/${chatId}?thread=${roots[2]}`);
    await expect(preview).toContainText('Third thread root');
    await expect(splitTabs).toHaveCount(3);
    await expect.poll(() => page.url()).not.toContain('thread=');

    // Pinned Threads persist, folded into the main strip; the preview does not.
    await page.reload();
    const mainTabs = page.getByRole('navigation', { name: 'Workspace tabs' });
    await expect(mainTabs.locator('.workspace-tab')).toHaveCount(3);
    await expect(
        mainTabs.getByRole('button', { name: 'First thread root', exact: true })
    ).toBeVisible();
    await expect(
        mainTabs.getByRole('button', { name: 'Third thread root', exact: true })
    ).toHaveCount(0);
    await expect(split).toHaveCount(0);
});
