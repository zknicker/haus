import type { Page } from '@playwright/test';
import {
    installDesktopBrowserStub,
    moveTabToRightPane,
    openDesktopWindow,
} from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('web links open browser tabs beside the chat, and the sidebar opens beside a web page', async ({
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
    const row = tabRow(page, 'Tabs').locator('.workspace-tab');
    const right = tabRow(page, 'Right pane tabs').locator('.workspace-tab');
    const address = page.getByRole('combobox', { name: 'Page address', exact: true });
    await composer.fill('Keep this draft');

    // One pane: a web link opens a new selected browser tab beside the chat.
    await page.getByRole('link', { name: 'Open B012345678 on Amazon' }).click();
    await expect(row).toHaveCount(2);
    await expect(row.nth(1)).toContainText('www.amazon.com');
    await expect(row.nth(1)).toHaveAttribute('data-active', 'true');
    // At rest the address shows the condensed label: no scheme, `www.`, or query.
    await expect(address).toHaveValue('amazon.com/dp/B012345678');

    // Move to right pane splits the window: the chat on the left, the web page on the right.
    await moveTabToRightPane(page, 'www.amazon.com');
    await expect(right).toHaveCount(1);
    await expect(right).toContainText('www.amazon.com');
    await expect(composer).toHaveText('Keep this draft');
    // The App reports the web page's placement so Electron can show its native view.
    await expect
        .poll(() =>
            page.evaluate(() => (window as { __browserLayout?: unknown[] }).__browserLayout)
        )
        .toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('browser-split.png') });

    // ⌘L focuses the address once the web page's pane is the focused one.
    await page
        .locator('.desktop-tab-frame[data-frame-pane="secondary"]:visible')
        .click({ position: { x: 8, y: 80 } });
    await page.keyboard.press('Meta+l');
    await expect(address).toBeFocused();
    await address.fill('https://example.com/docs');
    await address.press('Enter');
    await expect(address).toHaveValue('example.com/docs');

    // The sidebar never replaces a web page: Tasks opens as a selected tab right after it.
    await openSection(page, 'Tasks');
    await expect(right).toHaveCount(2);
    await expect(right.nth(1)).toContainText('Tasks');
    await expect(right.nth(1)).toHaveAttribute('data-active', 'true');
    await expect(address).toHaveCount(0);
    await expect(composer).toHaveText('Keep this draft');
    await right.nth(0).click();
    await expect(address).toHaveValue('example.com/docs');

    // Two panes: a web link opens a new browser tab in the other pane; the chat stays.
    await page.getByRole('link', { name: 'Open B012345678 on Amazon' }).click();
    await expect(right).toHaveCount(3);
    await expect(address).toHaveValue('amazon.com/dp/B012345678');
    await expect(composer).toHaveText('Keep this draft');

    // Closing the right pane's tabs never closes the chat.
    while (
        await page
            .getByRole('button', { name: /^Close (www\.amazon\.com|example\.com|Tasks)$/u })
            .count()
    ) {
        await page
            .getByRole('button', { name: /^Close (www\.amazon\.com|example\.com|Tasks)$/u })
            .first()
            .click();
    }
    await expect(row).toHaveCount(1);
    await expect(composer).toHaveText('Keep this draft');
});

function tabRow(page: Page, name: string) {
    return page.getByRole('navigation', { exact: true, name });
}
