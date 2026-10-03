import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

for (const desktop of [false, true]) {
    test(`Thread references open the addressed Thread on ${desktop ? 'desktop' : 'web'}`, async ({
        page,
    }) => {
        if (desktop) {
            await installDesktopBrowserStub(page);
        }
        const slug = `thread-reference-${desktop ? 'desktop' : 'web'}`;
        const { client, server } = await createTestServer(page, {
            displayName: 'Thread references',
            slug,
        });
        const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
        assertOpaqueId(chatId);
        const root = await client.chat.send.mutate({
            serverId: server.id,
            chatId,
            nonce: 'root',
            content: 'Referenced assignment',
        });
        await client.chat.send.mutate({
            serverId: server.id,
            chatId,
            nonce: 'reply',
            content: 'Thread destination',
            thread: { anchorMessageId: root.message.id },
        });
        // The linked anchor is outside the newest page, so opening cannot rely on loaded rows.
        for (let index = 0; index < 51; index += 1) {
            await client.chat.send.mutate({
                serverId: server.id,
                chatId,
                nonce: `filler-${index}`,
                content: `Later message ${index}`,
            });
        }
        await client.chat.send.mutate({
            serverId: server.id,
            chatId,
            nonce: 'reference',
            content: `Open [#all thread](chat://${chatId}?thread=${root.message.id}).`,
        });
        await page.goto(`${desktop ? '/#' : ''}/s/${slug}/chats/${chatId}`);
        const chip = page.getByRole('button', { name: 'Open Referenced assignment', exact: true });
        await expect(chip).toBeVisible();
        await expect(chip).not.toContainText(root.message.id);
        await expect(async () => {
            await page.mouse.move(0, 0);
            await chip.hover();
            await expect(page.getByRole('tooltip')).toContainText('Thread destination', {
                timeout: 1500,
            });
        }).toPass({ timeout: 10_000 });
        await chip.click();
        const pane = desktop
            ? page.getByRole('complementary', { name: 'Side pane' })
            : page.getByRole('complementary', { name: 'Thread' });
        await expect(pane.getByText('Thread destination', { exact: true })).toBeVisible();
        if (desktop) {
            await expect(
                page.locator('.workspace-band-trail .workspace-tab--preview')
            ).toContainText('Referenced assignment');
        } else {
            await expect(page).toHaveURL(new RegExp(`thread=${root.message.id}`, 'u'));
        }
    });
}

test('Thread title and hover preview screenshot', async ({ page }, testInfo) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Haus',
        slug: 'thread-chip-preview',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    runPsql(
        session.databaseUrl,
        `update chats set name = 'tech-ops', is_all = false where id = '${chatId}'`
    );
    const chat = { id: chatId };
    const root = await client.chat.send.mutate({
        serverId: server.id,
        chatId: chat.id,
        nonce: 'preview-root',
        content:
            'Recover trademark source discovery\nThe USPTO rate limit left discovery permanently stopped. Restore retries with safe backoff.',
    });
    for (const [index, content] of [
        'Reproduced the stopped worker after a transient rate limit.',
        'Recovery and backoff tests pass. Ready for review.',
    ].entries()) {
        await client.chat.send.mutate({
            serverId: server.id,
            chatId: chat.id,
            nonce: `preview-reply-${index}`,
            content,
            thread: { anchorMessageId: root.message.id },
        });
    }
    await client.chat.send.mutate({
        serverId: server.id,
        chatId: chat.id,
        nonce: 'preview-reference',
        content: `The Cursor agent is preparing a focused fix in [#tech-ops thread](chat://${chat.id}?thread=${root.message.id}). I’ll review the result when it returns.`,
    });
    await page.goto(`/s/thread-chip-preview/chats/${chat.id}`);
    const chip = page.getByRole('button', {
        name: 'Open Recover trademark source discovery',
        exact: true,
    });
    await expect(chip).toBeVisible();
    await expect(async () => {
        await page.mouse.move(0, 0);
        await chip.hover();
        await expect(page.getByRole('tooltip')).toContainText('Ready for review', {
            timeout: 1500,
        });
    }).toPass({ timeout: 10_000 });
    await expect(page.getByRole('tooltip')).toContainText('Thread in #tech-ops · 2 replies');
    await expect(page.getByRole('tooltip')).not.toContainText('The USPTO rate limit');
    await expect(page.getByRole('tooltip')).not.toContainText('Reproduced the stopped worker');
    await page.screenshot({ path: testInfo.outputPath('thread-chip-preview.png') });
});
