import { attachComputer, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('New Captain with no device leads to Settings → Devices', async ({ page }) => {
    await createTestServer(page, { displayName: 'Empty HQ', slug: 'empty-hq' });

    await page.getByRole('button', { name: 'New Captain' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create Captain' });
    await expect(
        createDialog.getByText('Connect a device in Settings → Devices to create a Captain.')
    ).toBeVisible();
    await createDialog.getByRole('button', { name: 'Add a device' }).click();

    await expect(page).toHaveURL(/\/s\/empty-hq\/settings\/computers$/u);
    await expect(createDialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Devices' })).toBeVisible();
});

test('Add device keeps waiting for a device that attached but has not connected yet', async ({
    page,
}) => {
    const { client } = await createTestServer(page, {
        displayName: 'Device HQ',
        slug: 'device-hq',
    });
    await page.goto('/s/device-hq/settings/computers');
    await page.getByRole('button', { name: 'Add device' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add device' });
    await expect(dialog.getByText('Waiting for the device…')).toBeVisible();

    await attachComputer(client, { credential: 'add-device-credential', slug: 'device-hq' });

    await expect(dialog.getByText('Waiting for the device…')).toBeVisible();
    await expect(dialog.getByText('Disconnected. Run Setup again.')).toHaveCount(0);
});
