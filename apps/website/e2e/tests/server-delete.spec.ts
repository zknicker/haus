import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('an Owner confirms the immutable address and permanently deletes a Server', async ({
    page,
}) => {
    const slug = 'codex-delete-smoke';
    const { client } = await createTestServer(page, {
        displayName: 'Codex Delete Smoke',
        slug,
    });
    await page.goto(`/s/${slug}/settings/server`);

    await page.getByRole('button', { name: 'Delete Server' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete Server' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/offline devices/iu)).toBeVisible();
    const confirmation = dialog.getByLabel(`Type ${slug} to confirm`);
    const deleteButton = dialog.getByRole('button', { name: 'Delete Server' });
    await expect(deleteButton).toBeDisabled();
    await confirmation.fill(`/${slug}`);
    await expect(deleteButton).toBeDisabled();
    await confirmation.fill(slug);
    await expect(deleteButton).toBeEnabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Delete Server' }).click();
    const reopenedDialog = page.getByRole('alertdialog', { name: 'Delete Server' });
    await expect(reopenedDialog.getByLabel(`Type ${slug} to confirm`)).toHaveValue('');
    await expect(reopenedDialog.getByRole('button', { name: 'Delete Server' })).toBeDisabled();

    await reopenedDialog.getByLabel(`Type ${slug} to confirm`).fill(slug);
    await reopenedDialog.getByRole('button', { name: 'Delete Server' }).click();
    await expect(page).not.toHaveURL(new RegExp(`/s/${slug}(?:/|$)`, 'u'));
    await expect(client.server.bySlug.query({ slug })).rejects.toThrow();
});
