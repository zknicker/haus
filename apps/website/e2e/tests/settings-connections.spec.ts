import type { Page } from '@playwright/test';
import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { createClient } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'connections-hq';

test.beforeAll(async () => {
    const { accessToken } = await createAppTestFixture();
    const owner = createClient(accessToken);
    await owner.server.create.mutate({ displayName: 'Connections HQ', slug });
});

test('creates and deletes a custom Server MCP connection', async ({ page }) => {
    const name = 'durable-smoke-mcp';
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/connections`);

    await openExplore(page);
    await exploreDialog(page).getByRole('button', { name: 'Add custom connection' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add connection' });
    await drawer.getByLabel('Name').fill(name);
    await drawer.getByLabel('URL').fill('https://example.com/mcp');
    await drawer.getByLabel('Authentication').click();
    await page.getByRole('option', { name: 'OAuth' }).click();
    await drawer.getByRole('button', { name: 'Add connection' }).click();

    const connection = page.getByRole('button', { name: new RegExp(name, 'u') });
    await expect(connection).toBeVisible();
    await connection.click();
    await expect(page).toHaveURL(/\/settings\/connections\/mcp_/u);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await removeConnectionFromPage(page, name);
    const confirmation = page.getByRole('alertdialog', { name: `Remove ${name} from Haus?` });
    await expect(confirmation).toContainText('No Captains currently use this connection.');
    await confirmation.getByRole('button', { name: 'Remove' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/connections$`, 'u'));
    await expect(connection).toHaveCount(0);
});

test('hides added presets and allows deleting every preset account', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/connections`);

    const explore = exploreDialog(page);
    const recommendation = (description: string) =>
        explore.locator('.item-card').filter({ hasText: description });
    const merchbase = recommendation('Query the MerchBase product catalog, designs, and sales.');
    await openExplore(page);
    await merchbase.getByRole('button', { exact: true, name: 'Add MerchBase' }).click();
    await expect(merchbase).toHaveCount(0);
    await explore.getByRole('button', { exact: true, name: 'Done' }).click();
    const connection = page.getByRole('button', { name: /MerchBase Built in/u });
    await expect(connection).toBeVisible();

    await page.reload();
    await expect(connection).toBeVisible();
    await openExplore(page);
    await expect(recommendation('Look up Amazon products')).toHaveCount(1);
    await expect(merchbase).toHaveCount(0);
    const addPreset = explore
        .locator('.item-card')
        .getByRole('button', { name: /^Add (?!(?:X|Skool|Factory|CoinGecko)$)/u });
    for (let remaining = await addPreset.count(); remaining > 0; remaining -= 1) {
        await addPreset.first().click();
        await expect(addPreset).toHaveCount(remaining - 1);
    }
    const x = recommendation('Search and read public posts on X.');
    await x.getByRole('button', { exact: true, name: 'Add X' }).click();
    const tokenDialog = page.getByRole('dialog', { name: 'Connect X' });
    await expect(tokenDialog.getByLabel('Bearer token')).toBeVisible();
    await tokenDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(tokenDialog).toHaveCount(0);
    await expect(x).toHaveCount(1);
    await explore.getByRole('button', { exact: true, name: 'Done' }).click();

    await connection.click();
    const title = (text: string) =>
        page.getByRole('heading', { exact: true, level: 1, name: text });
    await expect(title('MerchBase')).toBeVisible();
    await expect(page.getByRole('button', { exact: true, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Sign in required', { exact: true })).toBeVisible();
    await expect(
        page.getByText('This connection is added to Haus. Sign in', { exact: false })
    ).toBeVisible();
    const signInTab = page.context().waitForEvent('page');
    await page.getByRole('button', { name: 'Add another account' }).click();
    await (await signInTab).close();
    await expect(title('MerchBase account')).toBeVisible();
    await page.goto(`/s/${slug}/settings/connections`);
    const secondAccount = page.getByRole('button', { name: /MerchBase account Built in/u });
    await expect(secondAccount).toHaveCount(1);
    await secondAccount.click();
    await expect(title('MerchBase account')).toBeVisible();
    await removeConnectionFromPage(page, 'MerchBase account');
    await page
        .getByRole('alertdialog', { name: 'Remove MerchBase account from Haus?' })
        .getByRole('button', { exact: true, name: 'Remove' })
        .click();
    await expect(secondAccount).toHaveCount(0);
    await expect(connection).toBeVisible();

    await connection.click();
    await removeConnectionFromPage(page, 'MerchBase');
    const confirmation = page.getByRole('alertdialog', { name: 'Remove MerchBase from Haus?' });
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(title('MerchBase')).toBeVisible();
    await removeConnectionFromPage(page, 'MerchBase');
    await confirmation.getByRole('button', { exact: true, name: 'Remove' }).click();
    await expect(connection).toHaveCount(0);
    await openExplore(page);
    await expect(
        merchbase.getByRole('button', { exact: true, name: 'Add MerchBase' })
    ).toBeVisible();
    await page.reload();
    await expect(connection).toHaveCount(0);
    await openExplore(page);
    await expect(
        merchbase.getByRole('button', { exact: true, name: 'Add MerchBase' })
    ).toBeVisible();
});

function exploreDialog(page: Page) {
    return page.getByRole('dialog', { name: 'Explore connections' });
}

async function openExplore(page: Page) {
    await page.getByRole('button', { name: 'Explore connections' }).first().click();
    await expect(exploreDialog(page)).toBeVisible();
}

async function removeConnectionFromPage(page: Page, name: string) {
    await page.getByRole('button', { name: `${name} actions` }).click();
    await page.getByRole('menuitem', { name: 'Remove from Haus' }).click();
}
