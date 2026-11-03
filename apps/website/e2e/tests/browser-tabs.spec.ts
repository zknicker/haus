import type { Page } from '@playwright/test';
import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('web links open browser tabs on the right, and the sidebar keeps to the left pane', async ({
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
    await openDesktopWindow(page, `/s/${server.slug}/chats/${chatId}`);
    const composer = page.getByRole('textbox', { name: 'Message all' });
    const left = tabRow(page, 'Left pane tabs').locator('.workspace-tab');
    const right = tabRow(page, 'Right pane tabs').locator('.workspace-tab');
    const address = page.getByRole('combobox', { name: 'Page address', exact: true });
    const link = page.getByRole('link', { name: 'Open B012345678 on Amazon' });
    await composer.fill('Keep this draft');

    // A web link is Open: a new selected browser tab in the right pane, creating it.
    await link.click();
    await expect(left).toHaveCount(1);
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText('www.amazon.com');
    await expect(right.first()).toHaveAttribute('data-active', 'true');
    // At rest the address shows the condensed label: no scheme, `www.`, or query.
    await expect(address).toHaveValue('amazon.com/dp/B012345678');
    await expect(composer).toHaveText('Keep this draft');
    // The App reports the web page's placement so Electron can show its native view.
    await expect
        .poll(() =>
            page.evaluate(() => (window as { __browserLayout?: unknown[] }).__browserLayout)
        )
        .toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('browser-split.png') });

    // ⌘L focuses the address of the focused pane's web page.
    await page.keyboard.press('Meta+l');
    await expect(address).toBeFocused();
    await address.fill('https://example.com/docs');
    await address.press('Enter');
    await expect(address).toHaveValue('example.com/docs');

    // Another web link from the chat lands after the right pane's selected tab.
    await link.click();
    await expect(right).toHaveCount(2);
    await expect(right.nth(1)).toContainText('www.amazon.com');
    await expect(right.nth(1)).toHaveAttribute('data-active', 'true');

    // A Command-click on a web link opens a background tab beside the chat instead.
    await link.click({ modifiers: ['Meta'] });
    await expect(left).toHaveCount(2);
    await expect(left.nth(1)).toContainText('www.amazon.com');
    await expect(left.nth(0)).toHaveAttribute('data-active', 'true');

    // The sidebar is Go: it navigates the left pane's tab and leaves the web pages alone.
    await openSection(page, 'Tasks');
    await expect(left.nth(0)).toContainText('Tasks');
    await expect(right).toHaveCount(2);
    await right.nth(0).click();
    await expect(address).toHaveValue('example.com/docs');

    // Closing the right pane's tabs leaves the left pane.
    while (await right.count()) {
        await right
            .first()
            .getByRole('button', { name: /^Close /u })
            .click();
    }
    await expect(tabRow(page, 'Right pane tabs')).toHaveCount(0);
    await expect(tabRow(page, 'Tabs').locator('.workspace-tab')).toHaveCount(2);
});

function tabRow(page: Page, name: string) {
    return page.getByRole('navigation', { exact: true, name });
}
