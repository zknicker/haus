import { signInAsAppHuman } from '../support/app-session.ts';
import { expect, test } from '../support/test.ts';

test('a new Server opens straight into the App', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto('/s?choose');
    const nameField = page.getByLabel('Name');
    await page.getByRole('button', { name: 'Create a Server' }).click();
    await expect(nameField).toBeVisible();

    await nameField.fill('Haus HQ');
    const addressField = page.getByLabel('Address');
    await expect(addressField).toHaveValue('haus-hq');
    await addressField.fill('custom-address');
    await nameField.fill('Hearth');
    await expect(addressField).toHaveValue('custom-address');
    await addressField.fill('haus-hq');
    await page.getByRole('button', { name: 'Create Server' }).click();

    await expect(page).toHaveURL(/\/s\/haus-hq/u);
    await expect(page.getByRole('heading', { level: 1, name: 'Connect a device' })).toHaveCount(0);
    await page.goto('/s/haus-hq/members');
    await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
});

test('a human without membership cannot open the Server', async ({ page }) => {
    await signInAsAppHuman(page, 'peer');
    await page.goto('/s/haus-hq');
    await expect(page.getByText('Server Unavailable')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message all' })).toHaveCount(0);
});
