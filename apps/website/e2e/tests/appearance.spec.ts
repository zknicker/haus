import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { createClient } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'appearance-hq';

test.beforeAll(async () => {
    const { accessToken } = await createAppTestFixture();
    const owner = createClient(accessToken);
    await owner.server.create.mutate({ displayName: 'Appearance HQ', slug });
});

test('a preset theme applies at once and survives a reload', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/appearance`);
    const root = page.locator('html');
    await expect(
        page.getByRole('heading', { exact: true, level: 1, name: 'Appearance' })
    ).toBeVisible();
    await expect(root).toHaveAttribute('data-color-theme', 'default');

    await page
        .getByRole('radiogroup', { name: 'Theme' })
        .getByText('Nord', { exact: true })
        .click();
    await expect(root).toHaveAttribute('data-color-theme', 'nord');
    await expect(root).toHaveAttribute('data-palette', '');

    await page.getByRole('radiogroup', { name: 'Mode' }).getByText('Dark', { exact: true }).click();
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(46, 52, 64)');

    await page.reload();
    await expect(root).toHaveAttribute('data-color-theme', 'nord');
    await expect(root).toHaveAttribute('data-theme', 'dark');
});

test('a custom theme is created from the current theme, edited live, and deleted', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/appearance`);
    const root = page.locator('html');
    await page
        .getByRole('radiogroup', { name: 'Mode' })
        .getByText('Light', { exact: true })
        .click();
    await page.getByRole('button', { name: 'Create theme' }).click();

    await expect(root).toHaveAttribute('data-color-theme', /^custom-/u);
    await expect(page.getByRole('textbox', { name: 'Theme name' })).toHaveValue('Custom');
    await page.getByRole('button', { name: 'Pick background color' }).click();
    await page.getByRole('textbox', { name: 'Background hex' }).fill('#fff8f0');
    await page.getByRole('textbox', { name: 'Background hex' }).press('Enter');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 248, 240)');

    await page.reload();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 248, 240)');
    await expect(
        page.getByRole('radiogroup', { name: 'Theme' }).getByText('Custom', { exact: true })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(root).toHaveAttribute('data-color-theme', 'default');
    await expect(
        page.getByRole('radiogroup', { name: 'Theme' }).getByText('Custom', { exact: true })
    ).toHaveCount(0);
});
