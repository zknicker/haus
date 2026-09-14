import { attachComputer, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

for (const selection of ['mouse', 'keyboard'] as const) {
    test(`last Agent closes and disables the channel picker (${selection})`, async ({ page }) => {
        const { client, server, session } = await createTestServer(page, {
            displayName: `Channel picker ${selection}`,
            slug: `channel-picker-${selection}`,
        });
        const computer = await attachComputer(client, {
            credential: `channel-picker-${selection}-credential-1234567890`,
            slug: server.slug,
        });
        runPsql(
            session.databaseUrl,
            `insert into agents (id, server_id, computer_id, handle, display_name,
                                 home_timezone, desired_runtime_id, desired_model_id, created_at)
             values ('agt_picker_${selection}', '${server.id}', '${computer.computerId}',
                     'iris', 'Iris', 'America/New_York', 'codex', 'gpt-5.6-sol', now()),
                    ('agt_picker_default_${selection}', '${server.id}', '${computer.computerId}',
                     'scout', 'Scout', 'America/New_York', 'codex', 'gpt-5.6-sol', now() - interval '1 second')`
        );
        await page.reload();
        await page.getByRole('button', { name: 'New channel', exact: true }).click();
        const dialog = page.getByRole('dialog');
        const picker = dialog.getByRole('combobox', { name: 'Agents', exact: true });
        await expect(
            dialog.getByRole('button', { name: 'Remove Scout', exact: true })
        ).toBeVisible();
        await dialog.getByRole('textbox', { name: 'Channel name' }).fill('planning');

        if (selection === 'mouse') {
            await picker.click();
            await expect(picker).toHaveAttribute('aria-expanded', 'true');
            await page.getByRole('option', { name: 'IR Iris', exact: true }).click();
        } else {
            await picker.fill('Iris');
            await picker.press('ArrowDown');
            await picker.press('Enter');
        }

        await expect(picker).toBeDisabled();
        await expect(picker).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(page.getByText('No agents match.', { exact: true })).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: 'Show suggestions' })).toBeDisabled();

        await dialog.getByRole('button', { name: 'Remove Iris', exact: true }).click();
        await expect(picker).toBeEnabled();
        await expect(picker).toHaveAttribute('aria-expanded', 'false');
        await picker.fill('no-such-agent');
        await expect(page.getByText('No agents match.', { exact: true })).toBeVisible();
        await picker.fill('Iris');
        await page.getByRole('option', { name: 'IR Iris', exact: true }).click();
        await expect(picker).toBeDisabled();
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await page.getByRole('button', { name: 'New channel', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
    });
}
