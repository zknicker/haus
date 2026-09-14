import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('channel icon fades follow overflow and the name field has no inner divider', async ({
    page,
}) => {
    await createTestServer(page, { displayName: 'Channel appearance', slug: 'channel-appearance' });
    await page.getByRole('button', { name: 'New channel', exact: true }).click();
    const name = page.getByRole('textbox', { name: 'Channel name', exact: true });
    await name.fill('planning');
    await expect(page.locator('.channel-name-field .input-group__prefix')).toHaveCSS(
        'border-inline-end-width',
        '0px'
    );

    const trigger = page.getByRole('button', { name: 'Icon and color', exact: true });
    await trigger.click();
    const search = page.getByRole('searchbox', { name: 'Search icons' });
    const grid = page.locator('.channel-icon-swatches');
    await expect(grid).toHaveAttribute('data-bottom-scroll', 'true');
    await expect(grid).toHaveAttribute('data-top-scroll', 'false');

    await grid.evaluate((element) => {
        element.scrollTop = element.scrollHeight / 2;
    });
    await expect(grid).toHaveAttribute('data-top-bottom-scroll', 'true');
    await grid.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await expect(grid).toHaveAttribute('data-top-scroll', 'true');
    await expect(grid).toHaveAttribute('data-bottom-scroll', 'false');
    await grid.evaluate((element) => {
        element.scrollTop = 0;
    });
    await expect(grid).toHaveAttribute('data-top-scroll', 'false');
    await expect(grid).toHaveAttribute('data-bottom-scroll', 'true');

    await search.fill('telesc');
    const telescope = page.getByRole('button', { name: 'Telescope', exact: true });
    await telescope.click();
    await page.keyboard.press('Escape');
    await trigger.click();
    // Reopening reveals the selected icon deep in the catalog before filtering.
    await expect(grid).toHaveAttribute('data-top-bottom-scroll', 'true');
    await search.fill('telesc');
    await expect(telescope).toBeVisible();
    await expect(grid.getByRole('button')).toHaveCount(1);
    await expect(grid).toHaveCSS('mask-image', 'none');

    await search.fill('no-such-icon-zzzz');
    await expect(page.getByText('No icons match.', { exact: true })).toBeVisible();
    await expect(grid).toHaveCSS('mask-image', 'none');
    await search.clear();
    await expect(grid).toHaveAttribute('data-bottom-scroll', 'true');
    await expect(grid).toHaveAttribute('data-top-scroll', 'false');
    await expect(grid).not.toHaveCSS('mask-image', 'none');
});
