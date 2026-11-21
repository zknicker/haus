import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test.use({ browserName: 'webkit' });

test('Send keeps the composer focused for the next message on WebKit', async ({ page }) => {
    test.setTimeout(60_000);
    const { server } = await createTestServer(page, {
        displayName: 'Composer Focus Safari',
        slug: 'composer-focus-webkit',
    });
    const channelName = server.channels[0]?.name ?? 'haus';
    await openChannel(page, channelName);

    const composer = page.locator('.prompt-input').filter({ visible: true }).getByRole('textbox');
    await composer.fill('First of two quick sends');
    await expect(composer).toBeFocused();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('First of two quick sends', { exact: true })).toBeVisible();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveText('');

    await composer.fill('Second send without clicking back in');
    await page.keyboard.press('Enter');
    await expect(
        page.getByText('Second send without clicking back in', { exact: true })
    ).toBeVisible();
    await expect(composer).toBeFocused();
});
