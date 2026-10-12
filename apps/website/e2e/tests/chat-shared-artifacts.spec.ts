import { seedArtifactLibrary } from '../support/artifacts.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a shared-artifact link in a message opens the artifact in the App', async ({ page }) => {
    const slug = 'chat-shared-artifacts';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Chat Shared Artifacts',
        slug,
    });
    const { conceptId } = await seedArtifactLibrary(page, session.databaseUrl, server.id);
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
    if (!chatId) {
        throw new Error('The shared-artifact chat test did not resolve #all.');
    }
    const origin = new URL(page.url()).origin;
    await client.chat.send.mutate({
        chatId,
        content: [
            `Here is [the render](${origin}/s/${slug}/artifacts/${conceptId}).`,
            `Elsewhere: https://example.com/s/${slug}/artifacts/${conceptId}`,
        ].join('\n\n'),
        nonce: 'e2e-shared-artifact-link',
        serverId: server.id,
    });
    await page.goto(`/s/${slug}/chats/${chatId}`);

    const chip = page.getByTestId('shared-artifact-chip');
    await expect(chip).toHaveText('Concept render');
    await expect(chip).toHaveAttribute('href', `/s/${slug}/artifacts/${conceptId}`);
    await expect(chip).not.toHaveAttribute('target', '_blank');

    // The linked artifact rides the message's media strip as one tile.
    const tile = page
        .locator('[data-slot="message-media-strip"]')
        .getByTestId('shared-artifact-tile');
    await expect(tile).toHaveCount(1);
    await expect(tile).toContainText('Concept render');
    await expect(tile).toHaveAttribute('aria-label', 'Open Concept render, Image');
    // A decoded photo fills the tile, cropped like an attachment image.
    await expect(tile.locator('img')).toHaveCSS('object-fit', 'cover');
    // The 176px tile less its 1px border on each side.
    await expect(tile.locator('img')).toHaveCSS('width', '174px');

    // A foreign origin's look-alike URL stays an external link.
    await expect(
        page.locator(`a[href="https://example.com/s/${slug}/artifacts/${conceptId}"]`)
    ).toHaveAttribute('target', '_blank');

    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts/${conceptId}$`, 'u'));
    await expect(page.getByRole('heading', { name: 'Concept render', exact: true })).toBeVisible();

    await page.goBack();
    await page.getByTestId('shared-artifact-tile').click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts/${conceptId}$`, 'u'));
});
