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
           'cmp_e2esettings00000', '${server.id}', '${ownerUserId}', '${'e'.repeat(64)}',
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
    // configure it, then Usage and Archived chats as link-outs.
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
 * Usage is a dashboard and Archived chats is a chat list. The Server group is
 * their way in now that the sidebar's Server menu is gone, so each row has to
 * leave Settings rather than render a settings page.
 */
test('the Server group links out to Usage and Archived chats', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    await page.getByRole('row', { exact: true, name: 'Usage' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/usage$`, 'u'));

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
    const skills = page.getByRole('treegrid', { name: 'Skills' });
    await expect(skills.getByRole('row', { exact: true, name: 'durable-testing' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Durable Testing' })).toBeVisible();
    await expect(page.getByText('E2E fixture', { exact: true })).toBeVisible();
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

    // The Added list renders each connection as a card button, not a row.
    const connection = page.getByRole('button', { name: new RegExp(name, 'u') });
    await expect(connection).toBeVisible();
    await connection.click();
    const detail = page.getByRole('dialog', { name });
    await detail.getByRole('button', { name: 'Remove' }).click();
    const confirmation = page.getByRole('alertdialog', { name: `Remove ${name} from Haus?` });
    await expect(confirmation).toContainText('No Agents currently use this connection.');
    await confirmation.getByRole('button', { name: 'Remove' }).click();
    await expect(connection).toHaveCount(0);
});

test('hides added presets and allows deleting every preset account', async ({ page }) => {
    await signInAsClerkHuman(page);
    await page.goto(`/s/${slug}/settings/connections`);

    const recommendation = (description: string) =>
        page.locator('.item-card').filter({ hasText: description });
    const merchbase = recommendation('Query the MerchBase product catalog, designs, and sales.');
    const calendar = recommendation('Read and schedule events on your Google calendars.');
    await merchbase.getByRole('button', { exact: true, name: 'Add MCP' }).click();
    await expect(merchbase).toHaveCount(0);
    const connection = page.getByRole('button', { name: /MerchBase Built in/u });
    await expect(connection).toBeVisible();

    await page.reload();
    await expect(connection).toBeVisible();
    await expect(merchbase).toHaveCount(0);
    await calendar.getByRole('button', { exact: true, name: 'Add MCP' }).click();
    await expect(calendar).toHaveCount(0);
    await expect(page.getByText('Recommended', { exact: true })).toHaveCount(0);

    await connection.click();
    // The heading carries the connection's name alone; its state is a fact row
    // in the body, so `exact` keeps this off the "MerchBase account" dialog.
    const detail = page.getByRole('dialog', { exact: true, name: 'MerchBase' });
    await expect(detail.getByRole('button', { exact: true, name: 'Sign in' })).toBeVisible();
    await expect(detail).toContainText('Sign in required');
    await expect(detail).toContainText('This MCP is added to Haus. Sign in to your account');
    await expect(detail).toContainText('Removes this MCP and its credentials from this Server.');
    await detail.getByRole('button', { exact: true, name: 'Add' }).click();
    await detail.getByRole('button', { name: 'Done' }).click();
    const secondAccount = page.getByRole('button', { name: /MerchBase account Built in/u });
    await expect(secondAccount).toBeVisible();
    await secondAccount.click();
    await page
        .getByRole('dialog', { exact: true, name: 'MerchBase account' })
        .getByRole('button', { exact: true, name: 'Remove' })
        .click();
    await page
        .getByRole('alertdialog', { name: 'Remove MerchBase account from Haus?' })
        .getByRole('button', { exact: true, name: 'Remove' })
        .click();
    await expect(secondAccount).toHaveCount(0);
    await expect(connection).toBeVisible();
    await expect(merchbase).toHaveCount(0);

    await connection.click();
    await detail.getByRole('button', { exact: true, name: 'Remove' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Remove MerchBase from Haus?' });
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { exact: true, name: 'Remove' }).click();
    await confirmation.getByRole('button', { exact: true, name: 'Remove' }).click();
    await expect(connection).toHaveCount(0);
    await expect(merchbase.getByRole('button', { exact: true, name: 'Add MCP' })).toBeVisible();
    await page.reload();
    await expect(merchbase.getByRole('button', { exact: true, name: 'Add MCP' })).toBeVisible();
    await expect(connection).toHaveCount(0);
});
