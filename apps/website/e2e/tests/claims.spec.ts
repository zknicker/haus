import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a hosted claim message projects its status in the Chat and opens its Thread', async ({
    page,
}) => {
    const { client, server } = await createTestServer(page, {
        displayName: 'Claim Projection',
        slug: 'claim-projection',
    });
    await openChannel(page, 'all');

    await page.getByRole('textbox', { name: 'Message all' }).fill('Projected claim message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Projected claim message', { exact: true })).toBeVisible();

    const allChatId = server.channels.find((chat) => chat.name === 'all')?.id;
    if (!allChatId) {
        throw new Error('The claim projection flow did not resolve #all.');
    }
    // The visible row above may still be the optimistic one, so wait for the
    // Server to own the message before promoting it.
    await expect
        .poll(async () => {
            const snapshot = await client.chat.messages.query({
                chatId: allChatId,
                serverId: server.id,
            });
            return snapshot.messages.some(
                (message) => message.content === 'Projected claim message'
            );
        })
        .toBe(true);
    const snapshot = await client.chat.messages.query({ chatId: allChatId, serverId: server.id });
    const anchor = snapshot.messages.find(
        (message) => message.content === 'Projected claim message'
    );
    if (!anchor) {
        throw new Error('The claim projection flow did not resolve its anchor message.');
    }

    const promotion = await client.claim.promote.mutate({
        messageId: anchor.id,
        serverId: server.id,
    });

    await expect(page.getByText('Projected claim message', { exact: true })).toBeVisible();
    // Claim identity is the header of the recessed Thread surface beneath the
    // message — the same slot Cloud Agent work uses — and that whole
    // surface is the way into the work. The author line carries provenance only.
    const chip = page.getByTestId('message-claim-chip');
    const openThread = page.getByRole('button', { name: /^Open thread, Claim #1/u });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Claim #1');
    await expect(page.getByTestId('message-claim-mark')).toHaveCount(0);
    await expect(openThread).toBeVisible();

    // A status change rides the same claim realtime invalidation; no reload.
    await client.claim.update.mutate({
        expectedVersion: promotion.claim.version,
        messageId: anchor.id,
        patch: { status: 'in_progress' },
        serverId: server.id,
    });
    await expect(chip).toContainText('In progress');

    await openThread.click();
    const thread = page.getByRole('complementary', { name: 'Thread' });
    await expect(thread).toBeVisible();
    await expect(thread.getByRole('region', { name: 'Claim #1 details' })).toBeVisible();
    // The panel above the anchor states the claim in full, so the anchor's own
    // chip would say every word of it twice.
    await expect(thread.getByTestId('message-claim-chip')).toHaveCount(0);
    await expect(thread.getByRole('button', { name: 'Status for claim #1' })).toContainText(
        'In progress'
    );
});
