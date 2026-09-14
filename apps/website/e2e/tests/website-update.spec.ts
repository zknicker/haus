import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('website update reloads the same route only after drafts are cleared', async ({ page }) => {
    await page.route('**/haus-app-build.json', (route) =>
        route.fulfill({
            json: { buildId: '00000000-0000-4000-8000-000000000001' },
        })
    );
    await createTestServer(page, { displayName: 'Website Update', slug: 'website-update' });
    await openChannel(page, 'all');
    const composer = page.getByRole('textbox', { name: 'Message all' });
    await composer.fill('Keep this draft');
    const reload = page.getByRole('button', {
        name: 'Update available. Reload Haus.',
        exact: true,
    });
    await expect(reload).toBeVisible();
    await reload.hover();
    await expect(page.getByRole('tooltip')).toContainText('Update available. Reload Haus.');
    await reload.click();
    await expect(page.getByText('Finish your changes before reloading')).toBeVisible();
    await expect(composer).toHaveText('Keep this draft');
    await composer.press('ControlOrMeta+A');
    await composer.press('Backspace');
    await expect(composer).toHaveText('');
    const url = page.url();
    await page.unroute('**/haus-app-build.json');
    await Promise.all([page.waitForEvent('load'), reload.click()]);
    await expect(page).toHaveURL(url);
    await expect(composer).toBeVisible();
    await expect(reload).toHaveCount(0);
});

test('a failed check stays quiet and a later deployed build becomes reloadable', async ({
    page,
}) => {
    await page.route('**/haus-app-build.json', (route) => route.fulfill({ status: 503 }));
    await createTestServer(page, { displayName: 'Website Check', slug: 'website-check' });
    await openChannel(page, 'all');
    await expect(page.getByRole('textbox', { name: 'Message all' })).toBeVisible();
    await page.clock.install();
    const reload = page.getByRole('button', {
        name: 'Update available. Reload Haus.',
        exact: true,
    });
    await page.clock.fastForward(5000);
    await expect(reload).toHaveCount(0);
    await page.unroute('**/haus-app-build.json');
    await page.route('**/haus-app-build.json', (route) =>
        route.fulfill({
            json: { buildId: '00000000-0000-4000-8000-000000000002' },
        })
    );
    await page.clock.fastForward(60_000);
    await expect(reload).toBeVisible();
});
