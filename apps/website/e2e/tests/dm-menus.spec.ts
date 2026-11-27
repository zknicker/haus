import { createTestCaptain } from '../support/captains.ts';
import { captainTile, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('agent DM menus work before the first message and on the selected conversation', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'DM menus',
        slug: 'dm-menus',
    });
    const agentId = await createTestCaptain(client, {
        databaseUrl: session.databaseUrl,
        displayName: 'Marlow',
        handle: 'marlow',
        serverId: server.id,
    });
    await page.reload();
    const row = captainTile(page, 'Marlow');
    const profile = page.getByRole('menuitem', { name: 'View Captain profile', exact: true });
    const header = page.getByRole('button', { name: 'Marlow — chat actions', exact: true });

    await row.click({ button: 'right' });
    await expect(profile).toBeEnabled();
    await page.getByRole('menuitem', { name: 'Open chat', exact: true }).click();
    await expect(profile).toBeHidden();
    await expect(page.getByRole('heading', { name: 'No messages yet' })).toBeVisible();

    const panel = page.getByRole('complementary', { name: 'Captain panel' });
    await page.getByRole('button', { name: 'Hide panel', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await header.click();
    await expect(profile).toBeEnabled();
    await expect(page.getByRole('menuitem', { name: 'Attachments', exact: true })).toBeEnabled();
    await expect(page.getByRole('menuitem', { name: 'View tasks', exact: true })).toHaveCount(0);
    await profile.click();
    await expect(profile).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/captain/${agentId}$`, 'u'));
    await expect(panel).toBeVisible();
    await expect(header).toBeVisible();

    for (const target of [row, header]) {
        await target.click({ button: 'right' });
        await expect(profile).toBeEnabled();
        await page.keyboard.press('Escape');
        await expect(profile).toBeHidden();
    }
    expect(
        (await client.chat.list.query({ serverId: server.id })).some((chat) => chat.kind === 'dm')
    ).toBe(false);

    await page.getByRole('textbox', { name: 'Message Marlow' }).fill('First DM message');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('First DM message', { exact: true })).toBeVisible();
    await expect(header).toBeVisible();

    for (const reload of [false, true]) {
        if (reload) {
            await page.reload();
        }
        for (const target of [row, header]) {
            await target.click({ button: 'right' });
            await expect(profile).toBeEnabled();
            await page.keyboard.press('Escape');
            await expect(profile).toBeHidden();
        }
        await header.click();
        await expect(
            page.getByRole('menuitem', { name: 'Attachments', exact: true })
        ).toBeEnabled();
        await page.keyboard.press('Escape');
    }
});
