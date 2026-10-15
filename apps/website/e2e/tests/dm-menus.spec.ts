import { createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('agent DM menus work before the first message and on the selected conversation', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'DM menus',
        slug: 'dm-menus',
    });
    runPsql(
        session.databaseUrl,
        `
        insert into computers (id, server_id, attached_by_user_id, credential_hash, health)
        select 'cmp_e2edmmenus000000', '${server.id}', user_id, md5(random()::text) || md5(random()::text), 'offline'
        from server_memberships where server_id = '${server.id}' and role = 'owner';
        insert into agents (id, server_id, computer_id, handle, display_name, home_timezone,
            desired_runtime_id, desired_model_id)
        values ('agt_e2edmmenus000000', '${server.id}', 'cmp_e2edmmenus000000', 'marlow', 'Marlow',
            'America/New_York', 'codex', 'gpt-5.6-sol');
    `
    );
    await page.reload();
    const row = page.getByRole('row', { name: 'Marlow', exact: true });
    const profile = page.getByRole('menuitem', { name: 'View agent profile', exact: true });
    const tasks = page.getByRole('menuitem', { name: 'View tasks', exact: true });
    const header = page.getByRole('button', { name: 'Marlow — chat actions', exact: true });

    await row.click({ button: 'right' });
    await expect(profile).toBeEnabled();
    await expect(tasks).toBeDisabled();
    await page.getByRole('menuitem', { name: 'Open chat', exact: true }).click();
    await expect(profile).toBeHidden();
    await expect(page.getByRole('heading', { name: 'No messages yet' })).toBeVisible();

    await header.click();
    await expect(profile).toBeEnabled();
    await expect(tasks).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'Attachments', exact: true })).toBeDisabled();
    await profile.click();
    await expect(page).toHaveURL(/\/agents\/agt_e2edmmenus000000/u);
    await page.goBack();
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
            await expect(tasks).toBeEnabled();
            await page.keyboard.press('Escape');
            await expect(profile).toBeHidden();
        }
        await header.click();
        await expect(tasks).toBeEnabled();
        await expect(
            page.getByRole('menuitem', { name: 'Attachments', exact: true })
        ).toBeEnabled();
        await page.keyboard.press('Escape');
    }
});
