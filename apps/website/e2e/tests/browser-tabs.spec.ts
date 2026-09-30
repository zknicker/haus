import type { BrowserCommand, BrowserWorkspaceState } from '../../src/lib/desktop-browser.ts';
import { assertOpaqueId, createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('browser tabs preserve the chat draft, channel menu, and sidebar navigation', async ({
    page,
}, testInfo) => {
    await page.addInitScript(() => {
        let state: BrowserWorkspaceState = { activeId: null, tabs: [] };
        const listeners = new Set<(state: BrowserWorkspaceState) => void>();
        const command = async (input: BrowserCommand) => {
            if (input.kind === 'new' || input.kind === 'open') {
                const url = input.kind === 'new' ? 'about:blank' : input.url;
                const existing = input.kind === 'open' && state.tabs.find((tab) => tab.url === url);
                const id = existing?.id ?? crypto.randomUUID();
                if (!existing) {
                    state.tabs.push({
                        id,
                        url,
                        title: url === 'about:blank' ? 'New tab' : new URL(url).hostname,
                        loading: false,
                        error: null,
                        faviconUrl: null,
                        canGoBack: false,
                        canGoForward: false,
                        zoomFactor: 1,
                        find: null,
                    });
                }
                state.activeId = id;
            } else if (input.kind === 'reorder') {
                state.tabs = input.ids.flatMap((id) => state.tabs.filter((tab) => tab.id === id));
            } else if (input.kind === 'select') {
                state.activeId = input.id;
            } else if (input.kind === 'close') {
                state.tabs = state.tabs.filter((tab) => tab.id !== input.id);
                state.activeId = state.tabs.at(-1)?.id ?? null;
            } else if (input.kind === 'reset') {
                state = { activeId: null, tabs: [] };
            } else if (input.kind === 'navigate' && input.action === 'url') {
                const tab = state.tabs.find((item) => item.id === state.activeId);
                if (tab) {
                    tab.url = input.url;
                    tab.title = new URL(input.url).hostname;
                    tab.loading = false;
                }
            } else if (input.kind === 'navigate' && input.action === 'back') {
                document.documentElement.dataset.browserHistory = 'back';
            }
            for (const listener of listeners) {
                listener(structuredClone(state));
            }
            return state;
        };
        Object.defineProperty(window, 'hausDesktop', {
            value: {
                browserCommand: command,
                browserSnapshot: async () => structuredClone(state),
                browserBounds: async () => undefined,
                onBrowserState: (listener: (state: BrowserWorkspaceState) => void) => {
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
                getInfo: async () => ({ platform: 'darwin', isPackaged: false, version: '0.0.0' }),
                authTokenGet: async () => null,
                setTheme: async () => undefined,
                setDockBadge: async () => undefined,
                onUpdateStatus: () => () => undefined,
                onHistoryNavigate: (listener: (direction: 'back' | 'forward') => void) => {
                    const handler = () => listener('back');
                    window.addEventListener('test:desktop-history', handler);
                    return () => window.removeEventListener('test:desktop-history', handler);
                },
                onSsoCallback: () => () => undefined,
                runEditCommand: async () => undefined,
                checkForUpdate: async () => undefined,
                startWindowDrag: async () => undefined,
            },
        });
    });
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
