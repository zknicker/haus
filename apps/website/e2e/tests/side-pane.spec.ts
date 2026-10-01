import type { Locator } from '@playwright/test';
import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

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
    // One fixed name; aria-pressed carries whether the pane shows, the tooltip the action.
    const paneToggle = page.getByRole('button', { name: 'Side pane tabs', exact: true });
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
    await expect(paneToggle).toHaveCount(0);
    // Settings sits in the sidebar footer, not the band; its tooltip names the App menu's ⌘,.
    const settings = page
        .locator('[data-slot="sidebar-footer"]')
        .getByRole('button', { name: 'Settings', exact: true });
    await expect(
        page.locator('.workspace-titlebar').getByRole('button', { name: 'Settings' })
    ).toHaveCount(0);
    await expect(settings).toBeVisible();

    // An Agent profile opens in the side pane, beside the DM.
    await page.getByRole('button', { name: /Scout — chat actions/u }).click();
    await page.getByRole('menuitem', { name: 'View agent profile' }).click();
    await expect(sidePane.getByRole('region', { name: 'Agent profile' })).toBeVisible();
    await expect(sideTabs.locator('.workspace-tab')).toHaveCount(1);
    // React Aria opens hover tooltips once a press has set pointer modality.
    await settings.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Settings⌘,');
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(paneToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(newTab).toHaveCount(0);
    // The pane's tabs hold the band's one 240px basis rather than truncating beside free strip.
    expect((await sideTabs.locator('.workspace-tab').first().boundingBox())?.width).toBe(240);
    // Its tooltip names the Codex shortcut, which hides and shows the pane.
    await paneToggle.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Hide tabs⇧⌘B');
    await page.keyboard.press('Meta+Shift+B');
    await expect(sidePane).toHaveCount(0);
    await expect(paneToggle).toHaveAttribute('aria-pressed', 'false');
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
    // The first tab sits one gutter (px-2) right of the pane's edge, over the toolbar's controls.
    const firstTabBox = await sideTabs.locator('.workspace-tab').first().boundingBox();
    const tabInset = (firstTabBox?.x ?? 0) - (paneBox?.x ?? 0);
    expect(tabInset).toBeGreaterThanOrEqual(6);
    expect(tabInset).toBeLessThanOrEqual(12);
    expect(stripBox).not.toBeNull();
    // Hairlines continue the routed page's and the pane's leading edges up through the band.
    const sidebarBox = await page.getByRole('complementary', { name: 'Server' }).boundingBox();
    expect(await hairlineX(page.locator('.workspace-titlebar'))).toBe(
        (sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0) - 1
    );
    expect(await hairlineX(page.locator('.workspace-band-trail'))).toBe(paneBox?.x ?? -1);
    await page.screenshot({ path: testInfo.outputPath('side-pane.png') });

    // Expanding makes one strip, the primary tab first; the selected tab fills the content.
    await expand.click();
    await expect(sidePane).toHaveCount(0);
    await expect(strip.locator('.workspace-tab')).toHaveCount(3);
    await expect(strip.locator('.workspace-tab').first()).toHaveClass(/workspace-primary-tab/);
    await expect(address).toBeVisible();
    await expect(expand).toHaveAttribute('aria-pressed', 'true');
    await expect(paneToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.workspace-band-trail .badge')).toHaveCount(0);
    // Expanded has no side pane, so only the routed page's hairline remains.
    expect(await hairlineX(page.locator('.workspace-band-trail'))).toBeNull();
    expect(await hairlineX(page.locator('.workspace-titlebar'))).not.toBeNull();
    await page.screenshot({ path: testInfo.outputPath('expanded.png') });

    // The side pane toggle collapses back to the pane, the same tab selected.
    await paneToggle.click();
    await expect(strip).toHaveCount(0);
    await expect(paneToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(
        sidePane.getByRole('combobox', { name: 'Page address', exact: true })
    ).toBeVisible();

    // Hiding the pane keeps its tabs behind a count; the hover list reveals one.
    await paneToggle.click();
    await expect(sidePane).toHaveCount(0);
    await expect(address).toHaveCount(0);
    await expect(page.locator('.workspace-band-trail .badge')).toHaveText('2');
    await paneToggle.hover();
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

    // The native page paints above DOM, so the resize rail must sit wholly outside its region.
    await sidePane.getByRole('combobox', { name: 'Page address', exact: true }).fill('example.com');
    await sidePane.getByRole('combobox', { name: 'Page address', exact: true }).press('Enter');
    // A tab tooltip over the page would hide its native view; rest the pointer elsewhere.
    await page.mouse.move(0, 400);
    await expect.poll(() => page.evaluate(readPageRegion)).not.toBeNull();
    const pageRegion = await page.evaluate(readPageRegion);
    const rail = await page.getByRole('button', { name: 'Resize side pane' }).boundingBox();
    expect((rail?.x ?? 0) + (rail?.width ?? 0)).toBeLessThanOrEqual(pageRegion?.x ?? 0);
    expect(rail?.width).toBeGreaterThanOrEqual(7);

    // Canvas layout: the routed page's hairline sits on the content card's edge instead.
    await page.evaluate(() => {
        document.documentElement.dataset.shellVariant = 'canvas';
    });
    const card = await page.locator('.app-shell-main').boundingBox();
    expect(await hairlineX(page.locator('.workspace-titlebar'))).toBe(card?.x ?? -1);
    expect(await hairlineX(page.locator('.workspace-band-trail'))).toBe(
        (await sidePane.boundingBox())?.x ?? -1
    );
    await page.screenshot({ path: testInfo.outputPath('canvas-hairlines.png') });
});

/** The viewport x of a band hairline (the element's `::before`), or null when it draws none. */
function hairlineX(locator: Locator) {
    return locator.evaluate((node) => {
        const line = getComputedStyle(node, '::before');
        return line.content === 'none'
            ? null
            : node.getBoundingClientRect().left + Number.parseFloat(line.left);
    });
}

/** The page region the App last reported to the stubbed bridge; null while hidden. */
function readPageRegion() {
    return (window as { __browserBounds?: { x: number } | null }).__browserBounds ?? null;
}
