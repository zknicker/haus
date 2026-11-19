import { randomBytes } from 'node:crypto';
import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { assertOpaqueId, completeOnboarding, createClient, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'settings-hq';

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    const owner = createClient(accessToken);
    await owner.server.create.mutate({ displayName: 'Settings HQ', slug });
    const server = await owner.server.bySlug.query({ slug });
    completeOnboarding(databaseUrl, server.id);
    const ownerUserId = runPsql(databaseUrl, "select id from users where id = 'usr_e2e_human'");
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
    await signInAsAppHuman(page);
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
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    const groups = {
        Captains: ['Models', 'Skills', 'Connections'],
        Haus: ['General', 'Members', 'Devices', 'Usage', 'Archived chats'],
        You: ['Profile', 'Preferences', 'Notifications', 'Shortcuts', 'Servers'],
    };
    for (const [group, rows] of Object.entries(groups)) {
        await expect(
            page.getByRole('treegrid', { exact: true, name: group }).getByRole('row')
        ).toHaveText(rows);
    }
    for (const label of Object.values(groups)
        .flat()
        .filter((row) => row !== 'Archived chats')) {
        await page.getByRole('row', { exact: true, name: label }).click();
        await expect(
            page.getByRole('heading', { exact: true, level: 1, name: label })
        ).toBeVisible();
        if (label === 'Preferences') {
            await page.screenshot({ path: testInfo.outputPath('settings-preferences.png') });
        }
    }
    await expect(page.getByRole('row', { exact: true, name: 'Browser' })).toHaveCount(0);
    await page.getByRole('row', { exact: true, name: 'General' }).click();
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy Server ID' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete Server', exact: true })).toBeVisible();
    await page.getByRole('row', { name: 'Back to chat', exact: true }).hover();
    await page.screenshot({ path: testInfo.outputPath('settings-server.png') });

    await page.goto(`/s/${slug}/settings/server`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/general$`, 'u'));

    await page.goto(`/s/${slug}/settings/browser`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/computers$`, 'u'));
    await page.getByRole('row', { name: /Settings Computer/u }).click();
    await expect(page).toHaveURL(
        new RegExp(`/s/${slug}/settings/computers/cmp_e2esettings00000$`, 'u')
    );
    await expect(
        page.getByRole('heading', { exact: true, level: 1, name: 'Settings Computer' })
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Devices');
});

/**
 * Usage is a settings page, so the rail stays while you read it. Archived chats
 * is a chat list with its own route, so that row leaves Settings.
 */
test('Usage keeps the settings rail and Archived chats links out', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    await page.getByRole('row', { exact: true, name: 'Usage' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/usage$`, 'u'));
    await expect(page.getByRole('heading', { exact: true, level: 1, name: 'Usage' })).toBeVisible();
    await expect(page.getByRole('treegrid', { name: 'Haus', exact: true })).toBeVisible();

    await page.goto(`/s/${slug}/settings/profile`);
    await page.getByRole('row', { exact: true, name: 'Archived chats' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/archived$`, 'u'));
});

test('reads and updates the canonical human identity in Profile settings', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    const name = page.getByRole('textbox', { name: 'Display name' });

    await expect(name).toHaveValue('Zach Knickerbocker');
    await expect(page.getByRole('button', { name: 'Upload profile photo' })).toContainText('ZK');

    await name.fill('Zach');
    await name.press('Tab');
    await expect
        .poll(async () => {
            const { databaseUrl } = await createAppTestFixture();
            return runPsql(
                databaseUrl,
                "select display_name from users where id = 'usr_e2e_human'"
            );
        })
        .toBe('Zach');

    await page.reload();
    await expect(name).toHaveValue('Zach');
    await expect(page.getByRole('button', { name: 'Upload profile photo' })).toContainText('ZA');
});

test('reports current Computer models and skills in Server Settings', async ({ page }) => {
    await signInAsAppHuman(page);
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
