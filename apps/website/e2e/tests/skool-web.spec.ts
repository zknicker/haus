import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Skool setup on web explains the desktop requirement', async ({ page }) => {
    const slug = 'skool-web-hq';
    await createTestServer(page, { displayName: 'Skool Web HQ', slug });
    await page.goto(`/s/${slug}/settings/connections`);
    const skool = page
        .locator('.item-card')
        .filter({ hasText: 'Read your Skool communities, posts, and classroom courses.' });
    await skool.getByRole('button', { exact: true, name: 'Add Skool' }).click();
    const dialog = page.getByRole('dialog', { name: 'Desktop app required' });
    await expect(dialog).toContainText('Open Connections in the Haus desktop app');
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(skool).toHaveCount(1);
});
