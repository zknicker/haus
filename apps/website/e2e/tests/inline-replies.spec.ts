import { readClerkSessionFixture, signInAsClerkHuman } from '../support/clerk-session.ts';
import { completeOnboarding, createClient, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('inline replies send, survive reload, and navigate to an off-page parent', async ({
    page,
}, testInfo) => {
    test.setTimeout(90_000);
    const { token, databaseUrl } = readClerkSessionFixture();
    const client = createClient(token);
    const server = await client.server.create.mutate({
        displayName: 'Reply Preview',
        slug: 'reply-preview',
    });
    completeOnboarding(databaseUrl, server.id);
    const chatId = server.channels[0].id;
    const root = await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'How are sales today?',
        nonce: 'reply-root',
    });
    await signInAsClerkHuman(page);
    await page.goto('/s/reply-preview');
    await openChannel(page, server.channels[0].name ?? 'all');
    const rootRow = page.locator(
        `[data-slot="message-scroller-item"][data-message-id="${root.message.id}"]`
    );
    await rootRow.hover();
    const initialMessageBox = await rootRow.boundingBox();
    const initialComposerBox = await page.locator('.prompt-input').boundingBox();
    await rootRow.getByLabel('Reply', { exact: true }).click();
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
    expect(await page.locator('.prompt-input').boundingBox()).toEqual(initialComposerBox);
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
    await page.mouse.down();
    await expect(page.locator('.prompt-input:focus-within')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator('[data-inline-reply-reference]')).toHaveCount(0);
    await expect(page.locator('.chat-reply-target')).toHaveCount(0);
    expect((await rootRow.boundingBox())?.y).toBe(initialMessageBox?.y);
    expect(await page.locator('.prompt-input').boundingBox()).toEqual(initialComposerBox);
    await rootRow.hover();
    await rootRow.getByLabel('Reply', { exact: true }).click();
    const composer = page.getByRole('textbox', { name: `Message ${server.channels[0].name}` });
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
    expect(history.threads.every((thread) => thread.replyCount === 0)).toBe(true);
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

test('task inspection shows its inline conversation without creating a thread', async ({
    page,
}, testInfo) => {
    const { token, databaseUrl } = readClerkSessionFixture();
    const client = createClient(token);
    const server = await client.server.create.mutate({
        displayName: 'Reply Task',
        slug: 'reply-task',
    });
    completeOnboarding(databaseUrl, server.id);
    const chatId = server.channels[0].id;
    const root = await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'Review yesterday’s sales',
        nonce: 'task-root',
    });
    await client.task.promote.mutate({ messageId: root.message.id, serverId: server.id });
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
        nonce: 'task-followup',
        replyToMessageId: root.message.id,
    });
    await signInAsClerkHuman(page);
    await page.goto(`/s/reply-task/tasks?task=${root.message.id}`);
    const dialog = page.getByRole('dialog', { name: 'Task #1 thread' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Review yesterday’s sales', { exact: true })).toHaveCount(2);
    const quote = dialog.locator('[data-inline-reply-preview]');
    await expect(quote).toContainText('Review yesterday’s sales');
    await quote.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('region', { name: 'Inline replies' })).toHaveCount(0);
    await expect(dialog.getByText('Include returns in the report.', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Unrelated channel discussion', { exact: true })).toHaveCount(0);
    expect(
        runPsql(
            databaseUrl,
            `select count(*) from chats where server_id='${server.id}' and kind='thread'`
        )
    ).toBe('0');
    const threadInput = dialog.getByRole('textbox');
    await threadInput.fill('Discuss the details here.');
    await threadInput.press('Enter');
    await expect(dialog.getByText('Discuss the details here.', { exact: true })).toBeVisible();
    await client.chat.send.mutate({
        chatId,
        serverId: server.id,
        content: 'A later channel follow-up.',
        nonce: 'later-inline',
        replyToMessageId: root.message.id,
    });
    await expect(dialog.getByText('A later channel follow-up.', { exact: true })).toBeVisible();
    const transcript = dialog.getByTestId('thread-conversation');
    await expect(transcript).toContainText(
        /Include returns in the report\.[\s\S]*Discuss the details here\.[\s\S]*A later channel follow-up\./
    );
    const channelHistory = await client.chat.messages.query({ serverId: server.id, chatId });
    expect(
        channelHistory.messages.some((message) => message.content === 'Discuss the details here.')
    ).toBe(false);
    expect(channelHistory.threads).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath('task-unified-conversation.png') });
});
