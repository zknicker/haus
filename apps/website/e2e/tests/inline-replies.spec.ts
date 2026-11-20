import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { createClient, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('inline replies send, survive reload, and navigate to an off-page parent', async ({
    page,
}, testInfo) => {
    test.setTimeout(90_000);
    const { accessToken } = await createAppTestFixture();
    const client = createClient(accessToken);
    const server = await client.server.create.mutate({
        displayName: 'Reply Preview',
        slug: 'reply-preview',
    });
    const chatId = server.channels[0].id;
    const root = await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'How are sales today?',
        nonce: 'reply-root',
    });
    await signInAsAppHuman(page);
    await page.goto('/s/reply-preview');
    await openChannel(page, server.channels[0].name ?? 'all');
    // A turn's scroller id is its own identity, not a message id, so the row is
    // the one holding this message rather than the one named after it.
    const rootRow = page
        .locator('[data-slot="message-scroller-item"]')
        .filter({ has: page.locator(`[data-message-id="${root.message.id}"]`) });
    await rootRow.hover();
    const initialMessageBox = await rootRow.boundingBox();
    // Recently opened Chats stay mounted hidden; measure the composer on screen.
    const composerInput = page.locator('.prompt-input').filter({ visible: true });
    const composer = composerInput.getByRole('textbox');
    const initialComposerBox = await composerInput.boundingBox();
    await rootRow.getByLabel('Reply', { exact: true }).click();
    await expect(composer).toBeFocused();
    await rootRow.hover();
    await rootRow.getByLabel('Reply', { exact: true }).click();
    await expect(composer).toBeFocused();
    await expect(page.locator('[data-inline-reply-reference]')).toHaveAttribute(
        'title',
        'How are sales today?'
    );
    await expect(page.locator('[data-replying] .prompt-input__shell')).toHaveCSS(
        'border-top-left-radius',
        '0px'
    );
    await page.screenshot({ path: testInfo.outputPath('reply-composer.png') });
    expect((await rootRow.boundingBox())?.y).toBe(initialMessageBox?.y);
    expect(await composerInput.boundingBox()).toEqual(initialComposerBox);
    await expect(rootRow.locator('.chat-reply-target')).toHaveCount(1);
    const cancelBox = await page.getByRole('button', { name: 'Cancel reply' }).boundingBox();
    const sendBox = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
    expect(cancelBox).not.toBeNull();
    expect(sendBox).not.toBeNull();
    if (cancelBox && sendBox) {
        expect(
            Math.abs(cancelBox.x + cancelBox.width / 2 - sendBox.x - sendBox.width / 2)
        ).toBeLessThan(1);
    }
    await page.getByRole('button', { name: 'Cancel reply' }).hover();
    // Reply focuses the composer, and Cancel never takes that focus: the
    // button does not focus on press, so the person keeps typing where they were.
    await page.mouse.down();
    await expect(composer).toBeFocused();
    await page.mouse.up();
    await expect(composer).toBeFocused();
    await expect(page.locator('[data-inline-reply-reference]')).toHaveCount(0);
    await expect(page.locator('.chat-reply-target')).toHaveCount(0);
    expect((await rootRow.boundingBox())?.y).toBe(initialMessageBox?.y);
    expect(await composerInput.boundingBox()).toEqual(initialComposerBox);
    await rootRow.hover();
    await rootRow.getByLabel('Reply', { exact: true }).click();
    await expect(composer).toBeFocused();
    await composer.fill('Use yesterday instead, please.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('[data-inline-reply-reference]')).toHaveCount(0);
    await expect(page.locator('[data-inline-reply-preview]')).toContainText('How are sales today?');
    const replyTurn = page.locator('.chat-transcript-turn').filter({
        has: page.locator('[data-inline-reply-preview]'),
    });
    await expect(replyTurn).toContainText('Use yesterday instead, please.');
    await replyTurn.locator('[data-inline-reply-preview]').hover();
    await expect(replyTurn.locator('[data-turn-actions]')).toHaveCSS('opacity', '1');
    await expect(page.locator('.chat-reply-target')).toHaveCount(0);
    const history = await client.chat.messages.query({ chatId, serverId: server.id });
    const reply = history.messages.find(
        (message) => message.content === 'Use yesterday instead, please.'
    );
    expect(reply?.reply?.parentMessageId).toBe(root.message.id);
    await page.reload();
    await expect(page.locator('[data-inline-reply-preview]')).toContainText('How are sales today?');
    await page.screenshot({ path: testInfo.outputPath('inline-reply.png') });

    for (let index = 0; index < 55; index += 1) {
        await client.chat.send.mutate({
            chatId,
            serverId: server.id,
            content: `Other conversation ${index}`,
            nonce: `other-${index}`,
        });
    }
    await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'A later follow-up.',
        nonce: 'late-reply',
        replyToMessageId: root.message.id,
    });
    await page.reload();
    await expect(page.getByText('A later follow-up.', { exact: true })).toBeVisible();
    await expect(rootRow).toHaveCount(0);
    await page.locator('[data-inline-reply-preview]').last().click();
    await expect(rootRow).toBeInViewport();
    await expect(rootRow).toContainText('How are sales today?');

    await rootRow.locator(`[data-message-id="${root.message.id}"]`).hover();
    await rootRow.getByLabel('Reply', { exact: true }).click();
    await expect(page.locator('[data-inline-reply-reference]')).toHaveAttribute(
        'title',
        'How are sales today?'
    );
    await composer.fill('Keep this follow-up after a failed send.');
    await page.route('**/trpc/chat.send*', (route) => route.abort());
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(composer).toHaveText('Keep this follow-up after a failed send.');
    await expect(page.locator('[data-inline-reply-reference]')).toHaveAttribute(
        'title',
        'How are sales today?'
    );
    await page.unroute('**/trpc/chat.send*');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('[data-inline-reply-reference]')).toHaveCount(0);
    await expect
        .poll(async () => {
            const latest = await client.chat.messages.query({ chatId, serverId: server.id });
            return latest.messages.find(
                (message) => message.content === 'Keep this follow-up after a failed send.'
            )?.reply?.parentMessageId;
        })
        .toBe(root.message.id);
});

test('a saved claim link lands on its Chat at the claimed Message', async ({ page }, testInfo) => {
    const { accessToken } = await createAppTestFixture();
    const client = createClient(accessToken);
    const server = await client.server.create.mutate({
        displayName: 'Reply Claim',
        slug: 'reply-claim',
    });
    const chatId = server.channels[0].id;
    const root = await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'Review yesterday’s sales',
        nonce: 'claim-root',
    });
    await client.claim.promote.mutate({ messageId: root.message.id, serverId: server.id });
    await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'Unrelated channel discussion',
        nonce: 'unrelated',
    });
    await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'Include returns in the report.',
        nonce: 'claim-followup',
        replyToMessageId: root.message.id,
    });
    await signInAsAppHuman(page);
    await page.goto(`/s/reply-claim/chats/${chatId}?claim=${root.message.id}`);
    await expect(page).toHaveURL(new RegExp(`/chats/${chatId}$`, 'u'));
    const transcript = page.getByLabel('Messages', { exact: true });
    await expect(
        transcript.locator(`[data-message-id="${root.message.id}"]`).first()
    ).toBeInViewport();
    await expect(
        transcript.getByText('Include returns in the report.', { exact: true })
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('claim-link-reveal.png') });
});
