import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('expanded browser tabs preserve the chat draft, channel menu, and sidebar navigation', async ({
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
    // Expanded mode (offered once a tab is open): one strip, the primary tab
    // first, the selected tab full width.
    await page.getByRole('button', { name: 'Open as tabs' }).click();
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
    const firstBounds = await browserTabs.locator('.workspace-tab').nth(1).boundingBox();
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
    // Dropped on the first Amazon tab, Google moves before it; the primary tab stays first.
    await expect(browserTabs.locator('.workspace-tab').first()).toHaveClass(
        /workspace-primary-tab/
    );
    await expect(browserTabs.locator('.workspace-tab').nth(1)).toContainText('www.google.com');
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

test('split mode keeps the routed page and puts every other tab in the side pane', async ({
    page,
}, testInfo) => {
    await installDesktopBrowserStub(page);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Side pane',
        slug: 'side-pane',
    });
    const ownerUserId = runPsql(
        session.databaseUrl,
        "select id from users where clerk_user_id = 'user_e2e_human'"
    );
    assertOpaqueId(ownerUserId);
    const inventory = {
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    };
    runPsql(
        session.databaseUrl,
        `insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
         values ('cmp_sidepane00000000', '${server.id}', '${ownerUserId}', '${'f'.repeat(64)}', '${JSON.stringify(inventory)}'::jsonb, 'healthy')`
    );
    const { agent } = await client.agent.create.mutate({
        computerId: 'cmp_sidepane00000000',
        displayName: 'Scout',
        handle: 'scout',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: server.id,
    });
    await page.goto(`/#/s/side-pane/dm/${agent.id}`);
    const sidePane = page.getByRole('complementary', { name: 'Side pane' });
    const sideTabs = page.getByRole('navigation', { name: 'Side pane tabs' });
    const strip = page.getByRole('navigation', { name: 'Workspace tabs' });
    const hideTabs = page.getByRole('button', { name: 'Hide tabs', exact: true });
    const showTabs = page.getByRole('button', { name: 'Show tabs', exact: true });
    const expand = page.getByRole('button', { name: 'Open as tabs' });
    const newTab = page.getByRole('button', { name: 'New tab', exact: true });
    const address = page.getByRole('combobox', { name: 'Page address', exact: true });

    // Split mode is the default: the routed page has a plain title, no strip.
    await expect(page.locator('.workspace-page-title')).toContainText('Scout');
    await expect(strip).toHaveCount(0);
    await expect(sidePane).toHaveCount(0);
    // With no closable tab, a New tab button stands in for the layout controls.
    await expect(newTab).toBeVisible();
    await expect(expand).toHaveCount(0);
    await expect(hideTabs).toHaveCount(0);
    await expect(showTabs).toHaveCount(0);

    // An Agent profile opens in the side pane, beside the DM.
    await page.getByRole('button', { name: /Scout — chat actions/u }).click();
    await page.getByRole('menuitem', { name: 'View agent profile' }).click();
    await expect(sidePane.getByRole('region', { name: 'Agent profile' })).toBeVisible();
    await expect(sideTabs.locator('.workspace-tab')).toHaveCount(1);
    await expect(hideTabs).toHaveAttribute('aria-pressed', 'true');
    await expect(newTab).toHaveCount(0);
    // Its tooltip names the Codex shortcut, which hides and shows the pane.
    await hideTabs.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Hide tabs⇧⌘B');
    await page.keyboard.press('Meta+Shift+B');
    await expect(sidePane).toHaveCount(0);
    await expect(showTabs).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Meta+Shift+B');
    await expect(sidePane.getByRole('region', { name: 'Agent profile' })).toBeVisible();

    // A browser tab lands in the side pane too, its strip starting over the pane's edge.
    await sideTabs.page().getByRole('button', { name: 'New browser tab' }).click();
    await expect(
        sidePane.getByRole('combobox', { name: 'Page address', exact: true })
    ).toBeFocused();
    await expect(sideTabs.locator('.workspace-tab')).toHaveCount(2);
    const paneBox = await sidePane.boundingBox();
    const stripBox = await sideTabs.boundingBox();
    expect(Math.abs((stripBox?.x ?? 0) - (paneBox?.x ?? 0))).toBeLessThanOrEqual(6);
    await page.screenshot({ path: testInfo.outputPath('side-pane.png') });

    // Expanding makes one strip, the primary tab first; the selected tab fills the content.
    await expand.click();
    await expect(sidePane).toHaveCount(0);
    await expect(strip.locator('.workspace-tab')).toHaveCount(3);
    await expect(strip.locator('.workspace-tab').first()).toHaveClass(/workspace-primary-tab/);
    await expect(address).toBeVisible();
    await expect(expand).toHaveAttribute('aria-pressed', 'true');
    await expect(showTabs).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.workspace-band-trail .badge')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('expanded.png') });

    // The side pane toggle collapses back to the pane, the same tab selected.
    await showTabs.click();
    await expect(strip).toHaveCount(0);
    await expect(hideTabs).toHaveAttribute('aria-pressed', 'true');
    await expect(
        sidePane.getByRole('combobox', { name: 'Page address', exact: true })
    ).toBeVisible();

    // Hiding the pane keeps its tabs behind a count; the hover list reveals one.
    await hideTabs.click();
    await expect(sidePane).toHaveCount(0);
    await expect(address).toHaveCount(0);
    await expect(page.locator('.workspace-band-trail .badge')).toHaveText('2');
    await showTabs.hover();
    const openTabs = page.getByRole('navigation', { name: 'Open tabs' });
    await expect(openTabs).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('hidden-pane.png') });
    await openTabs.getByRole('button', { name: 'Scout' }).click();
    await expect(sidePane.getByRole('region', { name: 'Agent profile' })).toBeVisible();
    await expect(page.locator('.workspace-band-trail .badge')).toHaveCount(0);

    // Closing every tab brings the New tab button back; it opens a page in the pane.
    const closeButtons = sideTabs.getByRole('button', { name: /^Close /u });
    while (await closeButtons.count()) {
        await closeButtons.first().click();
    }
    await expect(sidePane).toHaveCount(0);
    await newTab.click();
    await expect(
        sidePane.getByRole('combobox', { name: 'Page address', exact: true })
    ).toBeFocused();
    await expect(sideTabs.locator('.workspace-tab')).toHaveCount(1);
});
