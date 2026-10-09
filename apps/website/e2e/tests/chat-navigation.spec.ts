import { assertOpaqueId, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

for (const intent of ['hover', 'focus'] as const) {
    test(`channel ${intent} warms history and cached navigation paints messages on its first frame`, async ({
        page,
    }) => {
        const { client, server, session } = await createTestServer(page, {
            displayName: 'Chat navigation',
            slug: `chat-navigation-${intent}`,
        });
        const chatId = server.channels.find((channel) => channel.name === 'all')?.id;
        assertOpaqueId(chatId);
        const otherChatId = `cht_navigation_${intent}`;
        runPsql(
            session.databaseUrl,
            `
            insert into chats (id, server_id, kind, is_all, name)
            values ('${otherChatId}', '${server.id}', 'channel', false, 'product');
            insert into channel_participants (server_id, chat_id, user_id)
            select '${server.id}', '${otherChatId}', user_id from server_memberships
            where server_id = '${server.id}' and role = 'owner';
        `
        );
        await client.chat.send.mutate({
            chatId: otherChatId,
            serverId: server.id,
            nonce: 'other-navigation-history',
            content: 'Other channel message',
        });
        for (let index = 0; index < 24; index += 1) {
            await client.chat.send.mutate({
                chatId,
                serverId: server.id,
                nonce: `navigation-history-${index}`,
                content: `History ${index}\n\nA **formatted paragraph** with enough height to exercise transcript mounting and scrolling.`,
            });
        }
        await client.chat.send.mutate({
            chatId,
            serverId: server.id,
            nonce: 'navigation-history',
            content: 'Cached navigation message',
        });
        // Idle warming may fetch #all before the intent does; either way its
        // history must be warm before the click.
        const history = page.waitForResponse(
            (response) =>
                response.url().includes('chat.messages') &&
                Boolean(response.request().postData()?.includes(chatId))
        );
        await page.goto(`/s/chat-navigation-${intent}/chats/${otherChatId}`);
        await expect(page.getByText('Other channel message', { exact: true })).toBeVisible();
        const row = page.getByRole('row', { name: 'all', exact: true });
        await expect(row).toBeVisible();
        if (intent === 'hover') {
            await row.hover();
        } else {
            await row.focus();
        }
        await history;
        await page.mouse.move(0, 0);
        await row.click();
        await expect(page.getByText('Cached navigation message', { exact: true })).toBeVisible();
        await page.getByRole('row', { name: 'product', exact: true }).click();
        await expect(page.getByText('Other channel message', { exact: true })).toBeVisible();

        const frames = await row.evaluate(async (element) => {
            const samples: { hasVisibleMessage: boolean; hasSurface: boolean }[] = [];
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            for (let index = 0; index < 12; index += 1) {
                await new Promise(requestAnimationFrame);
                // A kept-alive Chat stays mounted hidden; only a displayed surface counts.
                const surface = [
                    ...document.querySelectorAll('[data-slot="chat-surface"][aria-label="all"]'),
                ].find((node) => node.checkVisibility());
                const viewport = surface?.querySelector('[data-slot="message-scroller-viewport"]');
                const message = [
                    ...(surface?.querySelectorAll('[data-slot="markdown"]') ?? []),
                ].find((node) => node.textContent?.includes('Cached navigation message'));
                const viewportBox = viewport?.getBoundingClientRect();
                const messageBox = message?.getBoundingClientRect();
                samples.push({
                    hasVisibleMessage: Boolean(
                        viewportBox &&
                            messageBox &&
                            messageBox.bottom > viewportBox.top &&
                            messageBox.top < viewportBox.bottom
                    ),
                    hasSurface: Boolean(surface),
                });
            }
            return samples;
        });
        expect(frames.some((frame) => frame.hasSurface)).toBe(true);
        expect(frames.filter((frame) => frame.hasSurface && !frame.hasVisibleMessage)).toEqual([]);
    });
}

test('a channel row opens on press and still drags to reorder', async ({ page }, testInfo) => {
    // Per repeat, so `--repeat-each` can prove the drag is not timing-sensitive.
    const run = testInfo.repeatEachIndex;
    const { server, session } = await createTestServer(page, {
        displayName: 'Channel press',
        slug: `channel-press-${run}`,
    });
    const allId = server.channels.find((channel) => channel.name === 'all')?.id;
    assertOpaqueId(allId);
    const productId = `cht_channel_press_product_${run}`;
    runPsql(
        session.databaseUrl,
        `
        insert into chats (id, server_id, kind, is_all, name)
        values ('${productId}', '${server.id}', 'channel', false, 'product');
        insert into channel_participants (server_id, chat_id, user_id)
        select '${server.id}', '${productId}', user_id from server_memberships
        where server_id = '${server.id}' and role = 'owner';
    `
    );
    await page.goto(`/s/channel-press-${run}/chats/${productId}`);
    const channels = page.getByRole('treegrid', { name: 'Channels' });
    const order = async () => {
        const names = await channels.getByRole('row').allTextContents();
        return names.indexOf('all') < names.indexOf('product') ? 'all first' : 'product first';
    };
    await expect.poll(order).toBe('all first');
    const allBox = await channels.getByRole('row', { exact: true, name: 'all' }).boundingBox();
    const productBox = await channels
        .getByRole('row', { exact: true, name: 'product' })
        .boundingBox();
    if (!(allBox && productBox)) {
        throw new Error('Channel rows have no layout.');
    }

    // The press opens #all before the pointer moves, like a Chrome tab.
    await page.mouse.move(allBox.x + allBox.width / 2, allBox.y + allBox.height / 2);
    await page.mouse.down();
    await expect(page).toHaveURL(new RegExp(`/chats/${allId}$`));

    // The same press still drags #all below #product, and the drop opens nothing else.
    await page.mouse.move(productBox.x + productBox.width / 2, productBox.y + productBox.height, {
        steps: 12,
    });
    await page.mouse.up();
    await expect.poll(order).toBe('product first');
    await expect(page).toHaveURL(new RegExp(`/chats/${allId}$`));
});
