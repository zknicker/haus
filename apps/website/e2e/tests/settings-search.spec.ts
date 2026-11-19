import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('the settings search filters the rail to matching pages and rows', async ({ page }) => {
    const { server } = await createTestServer(page, {
        displayName: 'Settings Search HQ',
        slug: 'settings-search-hq',
    });
    await page.goto(`/s/${server.slug}/settings/profile`);
    const search = page.getByRole('searchbox', { name: 'Search settings' });
    await search.fill('server id');
    await expect(page.getByRole('row', { name: /General/u })).toContainText('Server ID');
    await expect(page.getByRole('row', { exact: true, name: 'Profile' })).toHaveCount(0);
    await search.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/s/${server.slug}/settings/general$`, 'u'));
    await expect(page.getByRole('row', { exact: true, name: 'Profile' })).toBeVisible();
    await search.fill('nothing like this');
    await expect(page.getByRole('status')).toHaveText('No settings match');
});
