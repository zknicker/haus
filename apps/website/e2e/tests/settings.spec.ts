import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { readClerkSessionFixture, signInAsClerkHuman } from '../support/clerk-session.ts';
import { assertOpaqueId, completeOnboarding, createClient, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'settings-hq';

test.beforeAll(async () => {
    const { databaseUrl, token } = readClerkSessionFixture();
    const owner = createClient(token);
    await owner.server.create.mutate({ displayName: 'Settings HQ', slug });
    const server = await owner.server.bySlug.query({ slug });
    completeOnboarding(databaseUrl, server.id);
    const ownerUserId = runPsql(
        databaseUrl,
        "select id from users where clerk_user_id = 'user_e2e_human'"
    );
    assertOpaqueId(ownerUserId);
    runPsql(
        databaseUrl,
        `update users set display_name = 'Zach Knickerbocker', avatar_id = null where id = '${ownerUserId}'`
    );
    const inventory = JSON.stringify({
        importableSkills: [
            {
                description: 'Durable browser coverage for a reported Computer skill.',
                id: 'hsk_e2e_durable',
                name: 'durable-testing',
                source: 'E2E fixture',
            },
        ],
        name: 'Settings Computer',
        runtimes: [
            {
                id: 'codex',
                label: 'Codex',
                models: [
                    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
                    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
                ],
            },
        ],
    });
    runPsql(
        databaseUrl,
        `insert into computers (
           id, server_id, attached_by_user_id, credential_hash, reported_inventory, health
         ) values (
           'cmp_e2esettings00000', '${server.id}', '${ownerUserId}', '${randomBytes(32).toString('hex')}',
           '${inventory}'::jsonb, 'healthy'
         )`
    );
});

test('aligns the Settings escape row with the first Chat navigation row', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}`);

    // Inbox leads the chat navigation, so it is the line the escape row has to
    // land on: each leads its own sidebar page, so both take the shell's lead
    // offset and meet the content topbar's midline.
    const inboxBox = await page.getByRole('row', { exact: true, name: 'Inbox' }).boundingBox();
    expect(inboxBox).not.toBeNull();

    await page.goto(`/s/${slug}/settings/appearance`);
    const backBox = await page
        .getByRole('row', { exact: true, name: 'Back to chat' })
        .boundingBox();
    expect(backBox).not.toBeNull();
    expect(backBox?.y).toBe(inboxBox?.y);
    expect(backBox?.height).toBe(inboxBox?.height);
    const profileBox = await page.getByRole('row', { exact: true, name: 'Profile' }).boundingBox();
    expect(profileBox).not.toBeNull();
    expect(backBox?.x).toBe(profileBox?.x);
    expect(backBox?.width).toBe(profileBox?.width);
    await page.getByRole('row', { exact: true, name: 'Back to chat' }).click();
    await expect(page).not.toHaveURL(/\/settings\//u);
});

test('settings navigation names the page and reaches Server deletion', async ({
    page,
}, testInfo) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    const personal = page.getByRole('treegrid', { name: 'Preferences', exact: true });
    const shared = page.getByRole('treegrid', { name: 'Server', exact: true });
    // Personal: Profile, Preferences, Servers. Server: the five pages that
    // configure it, Usage, then Archived chats as a link-out.
    await expect(personal.getByRole('row')).toHaveCount(3);
    await expect(shared.getByRole('row')).toHaveCount(7);
    await expect(personal.getByRole('row', { name: 'Servers', exact: true })).toBeVisible();
    await expect(shared.getByRole('row', { name: 'Connections', exact: true })).toBeVisible();
    await expect(shared.getByRole('row', { name: 'Skills', exact: true })).toBeVisible();
    for (const label of [
        'Profile',
        'Preferences',
        'Servers',
        'Server',
        'Members',
        'Connections',
        'Models',
        'Skills',
        'Usage',
    ]) {
        await page.getByRole('row', { exact: true, name: label }).click();
        await expect(
            page.getByRole('heading', { exact: true, level: 1, name: label })
        ).toBeVisible();
        if (label === 'Preferences') {
            await page.screenshot({ path: testInfo.outputPath('settings-preferences.png') });
        }
    }
    await expect(page.getByRole('row', { exact: true, name: 'Browser' })).toHaveCount(0);
    await page.getByRole('row', { exact: true, name: 'Server' }).click();
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Server', exact: true })).toBeVisible();
    await page.getByRole('row', { name: 'Back to chat', exact: true }).hover();
    await page.screenshot({ path: testInfo.outputPath('settings-server.png') });

    await page.goto(`/s/${slug}/settings/browser`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/computers$`, 'u'));
    await expect(
        page.getByRole('heading', { exact: true, level: 1, name: 'Settings Computer' })
    ).toBeVisible();
});

/**
 * Usage is a settings page, so the rail stays while you read it. Archived chats
 * is a chat list with its own route, so that row leaves Settings.
 */
test('Usage keeps the settings rail and Archived chats links out', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    await page.getByRole('row', { exact: true, name: 'Usage' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/usage$`, 'u'));
    await expect(page.getByRole('heading', { exact: true, level: 1, name: 'Usage' })).toBeVisible();
    await expect(page.getByRole('treegrid', { name: 'Server', exact: true })).toBeVisible();

    await page.goto(`/s/${slug}/settings/profile`);
    await page.getByRole('row', { exact: true, name: 'Archived chats' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/archived$`, 'u'));
});

test('reads and updates the canonical human identity in Profile settings', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    const name = page.getByRole('textbox', { name: 'Display name' });

    await expect(name).toHaveValue('Zach Knickerbocker');
    await expect(page.getByRole('button', { name: 'Upload profile photo' })).toContainText('ZK');

    await name.fill('Zach');
    await name.press('Tab');
    await expect
        .poll(() => {
            const { databaseUrl } = readClerkSessionFixture();
            return runPsql(
                databaseUrl,
                "select display_name from users where clerk_user_id = 'user_e2e_human'"
            );
        })
        .toBe('Zach');

    await page.reload();
    await expect(name).toHaveValue('Zach');
    await expect(page.getByRole('button', { name: 'Upload profile photo' })).toContainText('ZA');
});

test('reports current Computer models and skills in Server Settings', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/models`);

    await expect(page.getByRole('heading', { level: 1, name: 'Models' })).toBeVisible();
    await expect(page.getByText('Codex', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('GPT-5.6 Terra', { exact: true })).toBeVisible();
    await expect(page.getByText('gpt-5.6-terra', { exact: true })).toBeVisible();

    await page.goto(`/s/${slug}/settings/skills`);
    await page.getByRole('button', { name: /Durable Testing/u }).click();
    const skill = page.getByRole('dialog', { name: /Durable Testing/u });
    await expect(skill.getByRole('heading', { name: /Durable Testing/u })).toBeVisible();
    // Where the skill lives sits behind the dialog's collapsed Details.
    await skill.getByRole('button', { name: 'Details' }).click();
    await expect(skill.getByText('E2E fixture', { exact: true })).toBeVisible();
    await expect(skill.getByText('Settings Computer', { exact: true })).toBeVisible();
});

test('creates and deletes a custom Server MCP connection', async ({ page }) => {
    const name = 'durable-smoke-mcp';
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/connections`);

    await page.getByRole('button', { name: 'Add MCP Server' }).click();
    const drawer = page.getByRole('dialog', { name: 'Add MCP Server' });
    await drawer.getByLabel('Name').fill(name);
    await drawer.getByLabel('URL').fill('https://example.com/mcp');
    await drawer.getByLabel('Authentication').click();
    await page.getByRole('option', { name: 'OAuth' }).click();
    await drawer.getByRole('button', { name: 'Add MCP' }).click();

    // The Added grid renders each connection as a card button, not a row.
    const connection = page.getByRole('button', { name: new RegExp(name, 'u') });
    await expect(connection).toBeVisible();
    // A saved connection opens its own settings page.
    await connection.click();
    await expect(page).toHaveURL(/\/settings\/connections\/mcp_/u);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await removeConnectionFromPage(page, name);
    const confirmation = page.getByRole('alertdialog', { name: `Remove ${name} from Haus?` });
    await expect(confirmation).toContainText('No Agents currently use this connection.');
    await confirmation.getByRole('button', { name: 'Remove' }).click();
    // A removed connection's page hands the reader back to the list.
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/connections$`, 'u'));
    await expect(connection).toHaveCount(0);
});

test('hides added presets and allows deleting every preset account', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/connections`);

    const recommendation = (description: string) =>
        page.locator('.item-card').filter({ hasText: description });
    const merchbase = recommendation('Query the MerchBase product catalog, designs, and sales.');
    await merchbase.getByRole('button', { exact: true, name: 'Add MerchBase' }).click();
    await expect(merchbase).toHaveCount(0);
    const connection = page.getByRole('button', { name: /MerchBase Built in/u });
    await expect(connection).toBeVisible();

    await page.reload();
    await expect(connection).toBeVisible();
    await expect(merchbase).toHaveCount(0);
    // Drain whatever one-press presets remain so adding a new one never breaks
    // this test. X takes a token first, so it stays until one is saved.
    const addPreset = page.locator('.item-card').getByRole('button', { name: /^Add (?!X$)/u });
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

    await connection.click();
    const title = (text: string) =>
        page.getByRole('heading', { exact: true, level: 1, name: text });
    await expect(title('MerchBase')).toBeVisible();
    await expect(page.getByRole('button', { exact: true, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Sign in required', { exact: true })).toBeVisible();
    await expect(
        page.getByText('This MCP is added to Haus. Sign in to your account', { exact: false })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add another account' }).click();
    // Back in history is client-side, so the add mutation keeps running.
    await page.goBack();
    const secondAccount = page.getByRole('button', { name: /MerchBase account Built in/u });
    await expect(secondAccount).toBeVisible();
    await secondAccount.click();
    await expect(title('MerchBase account')).toBeVisible();
    await removeConnectionFromPage(page, 'MerchBase account');
    await page
        .getByRole('alertdialog', { name: 'Remove MerchBase account from Haus?' })
        .getByRole('button', { exact: true, name: 'Remove' })
        .click();
    await expect(secondAccount).toHaveCount(0);
    await expect(connection).toBeVisible();
    await expect(merchbase).toHaveCount(0);

    await connection.click();
    await removeConnectionFromPage(page, 'MerchBase');
    const confirmation = page.getByRole('alertdialog', { name: 'Remove MerchBase from Haus?' });
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(title('MerchBase')).toBeVisible();
    await removeConnectionFromPage(page, 'MerchBase');
    await confirmation.getByRole('button', { exact: true, name: 'Remove' }).click();
    await expect(connection).toHaveCount(0);
    await expect(
        merchbase.getByRole('button', { exact: true, name: 'Add MerchBase' })
    ).toBeVisible();
    await page.reload();
    await expect(
        merchbase.getByRole('button', { exact: true, name: 'Add MerchBase' })
    ).toBeVisible();
    await expect(connection).toHaveCount(0);
});

/** Removal is a rare action, so it sits in the connection page's `···` menu. */
async function removeConnectionFromPage(page: Page, name: string) {
    await page.getByRole('button', { name: `${name} actions` }).click();
    await page.getByRole('menuitem', { name: 'Remove from Haus' }).click();
}
