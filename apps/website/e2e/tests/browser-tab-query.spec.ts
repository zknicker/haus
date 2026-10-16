import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const authorizeUrl =
    'https://linear.app/oauth/authorize?actor=app&client_id=abc&response_type=code&scope=read%2Cwrite&state=s1#section';

test('a web page opened from the App keeps its query and hash', async ({ page }) => {
    await installDesktopBrowserStub(page);
    const { server } = await createTestServer(page, {
        displayName: 'Browser tab query',
        slug: 'browser-tab-query',
    });
    await openDesktopWindow(page, `/s/${server.slug}`);
    await expect(page.getByRole('navigation', { exact: true, name: 'Tabs' })).toBeVisible();

    // Electron denies the about:blank popup, then the URL arrives as an open request.
    await page.evaluate((url) => {
        const popup = window.open('about:blank', '_blank');
        if (popup) {
            throw new Error('Electron denies popups; the stub must too.');
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }, authorizeUrl);

    const right = page
        .getByRole('navigation', { exact: true, name: 'Right pane tabs' })
        .locator('.workspace-tab');
    await expect(right).toHaveCount(1);
    await expect(right.first()).toContainText('linear.app');
    await expect
        .poll(() =>
            page.evaluate(() =>
                (
                    window as { hausDesktop?: { browserSnapshot: () => Promise<unknown> } }
                ).hausDesktop?.browserSnapshot()
            )
        )
        .toMatchObject({ tabs: [{ url: authorizeUrl }] });
    const address = page.getByRole('combobox', { name: 'Page address', exact: true });
    await address.focus();
    await expect(address).toHaveValue(authorizeUrl);
});
