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
