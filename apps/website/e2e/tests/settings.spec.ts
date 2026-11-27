import { randomBytes } from 'node:crypto';
import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { assertOpaqueId, createClient, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'settings-hq';

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    const owner = createClient(accessToken);
    await owner.server.create.mutate({ displayName: 'Settings HQ', slug });
    const server = await owner.server.bySlug.query({ slug });
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

test('the Settings escape row sits on the Settings rows and leaves Settings', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/appearance`);
    const backBox = await page
        .getByRole('row', { exact: true, name: 'Back to chat' })
        .boundingBox();
    expect(backBox).not.toBeNull();
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
        Captains: ['Models', 'Git', 'Skills', 'Connections'],
        Haus: [
            'General',
            'Members',
            'Projects',
            'Repositories',
            'Devices',
            'Usage',
            'Archived chats',
        ],
        You: ['Profile', 'Preferences', 'Appearance', 'Notifications', 'Shortcuts', 'Servers'],
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
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await page.getByRole('row', { name: 'Back to chat', exact: true }).hover();
    await page.screenshot({ path: testInfo.outputPath('settings-server.png') });

    await page.goto(`/s/${slug}/settings/server`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/general$`, 'u'));

    await page.goto(`/s/${slug}/settings/browser`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/computers$`, 'u'));
    await page.getByRole('link', { name: /Settings Computer/u }).click();
    await expect(page).toHaveURL(
        new RegExp(`/s/${slug}/settings/computers/cmp_e2esettings00000$`, 'u')
    );
    await expect(
        page.getByRole('heading', { exact: true, level: 1, name: 'Settings Computer' })
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Devices');
});

/** Usage and Archived chats are settings pages, so the rail stays while you read them. */
test('Usage and Archived chats keep the settings rail', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto(`/s/${slug}/settings/profile`);
    await page.getByRole('row', { exact: true, name: 'Usage' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/usage$`, 'u'));
    await expect(page.getByRole('heading', { exact: true, level: 1, name: 'Usage' })).toBeVisible();
    await expect(page.getByRole('treegrid', { name: 'Haus', exact: true })).toBeVisible();

    await page.getByRole('row', { exact: true, name: 'Archived chats' }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/archived$`, 'u'));
    await expect(
        page.getByRole('heading', { exact: true, level: 1, name: 'Archived chats' })
    ).toBeVisible();
    await expect(page.getByRole('treegrid', { name: 'Haus', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Archived chats — Haus');

    await page.goto(`/s/${slug}/archived`);
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/archived$`, 'u'));
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
    await expect(page.getByText('GPT-5.6 Terra', { exact: true })).toBeVisible();
    await expect(page.getByText('gpt-5.6-terra', { exact: true })).toBeVisible();
    await expect(page.getByText('Detected Runtimes')).toHaveCount(0);

    await page.goto(`/s/${slug}/settings/skills`);
    await page.getByRole('button', { name: /Durable Testing/u }).click();
    const skill = page.getByRole('dialog', { name: /Durable Testing/u });
    await expect(skill.getByRole('heading', { name: /Durable Testing/u })).toBeVisible();
    // Where the skill lives sits behind the dialog's collapsed Details.
    await skill.getByRole('button', { name: 'Details' }).click();
    await expect(skill.getByText('E2E fixture', { exact: true })).toBeVisible();
    await expect(skill.getByText('Settings Computer', { exact: true })).toBeVisible();
});
