import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Claim Threads render and update metadata as desktop Thread pages', async ({ page }) => {
    await installDesktopBrowserStub(page);
    const { client, server } = await createTestServer(page, {
        displayName: 'Claim Thread tabs',
        slug: 'claim-thread-tabs',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    const created = await client.claim.create.mutate({
        serverId: server.id,
        chatId,
        content: 'Inspect Claim Thread metadata',
        nonce: 'claim-thread-tab-root',
    });
    await openDesktopWindow(
        page,
        `/s/${server.slug}/chats/${chatId}?thread=${created.claim.messageId}`
    );
    // A `?thread=` link opens the claim's Thread page as a new tab in the right pane, creating
    // it beside the chat (a deep link is Open, ADR 0046).
    const pane = page.locator('.desktop-tab-frame[data-frame-pane="secondary"]:visible');
    const details = page.getByRole('region', { name: 'Claim #1 details' });
    await expect(pane.getByRole('region', { name: 'Claim #1 details' })).toBeVisible();
    await expect(details.getByText('Created by', { exact: true })).toBeVisible();
    await details.getByRole('button', { name: 'Status for claim #1', exact: true }).click();
    await page.getByRole('option', { name: 'Done', exact: true }).click();
    await expect
        .poll(
            async () =>
                (await client.claim.list.query({ serverId: server.id, chatId })).claims[0]?.claim
                    .status
        )
        .toBe('done');
    await details.getByRole('button', { name: 'Assignee for claim #1', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Unassigned', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details).toBeVisible();
    await expect(
        details.getByRole('button', { name: 'Status for claim #1', exact: true })
    ).toContainText('Done');
});
