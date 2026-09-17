import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Dev Mode shows saved routing, persists on reload, and hides it when disabled', async ({
    page,
}) => {
    const { client, server } = await createTestServer(page, {
        displayName: 'Routing debug',
        slug: 'routing-debug',
    });
    const channel = server.channels.find((chat) => chat.name === 'all');
    if (!channel) {
        throw new Error('The Server must create #all.');
    }
    await client.chat.send.mutate({
        serverId: server.id,
        chatId: channel.id,
        content: 'Please investigate the export path too.',
        nonce: 'routing-debug-browser',
    });
    await openChannel(page, 'all');
    const routing = page.getByRole('button', { name: '→ None · routing off', exact: true });
    await expect(page.getByText('Please investigate the export path too.')).toBeVisible();
    await expect(routing).toHaveCount(0);
    const composer = page.getByRole('textbox', { name: 'Message all', exact: true });
    await composer.press('ControlOrMeta+k');
    await page.getByRole('menuitem', { name: 'Turn Dev Mode On', exact: true }).click();
    await routing.click();
    await expect(page.getByText('Not called', { exact: true })).toBeVisible();
    await expect(
        page.getByText(
            'Jev was skipped: routing off. Recipients came from the normal delivery rules.'
        )
    ).toBeVisible();
    await page.reload();
    await expect(routing).toBeVisible();
    await composer.press('ControlOrMeta+k');
    await page.getByRole('menuitem', { name: 'Turn Dev Mode Off', exact: true }).click();
    await expect(routing).toHaveCount(0);
    await expect(page.getByText('Please investigate the export path too.')).toBeVisible();
});
