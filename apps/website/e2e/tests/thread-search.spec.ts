import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { completeOnboarding, createClient, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

let anchorMessageId: string;
let replySequence: number;

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    const owner = createClient(accessToken);
    await owner.server.create.mutate({ displayName: 'Thread Search', slug: 'thread-search' });
    const server = await owner.server.bySlug.query({ slug: 'thread-search' });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id as string;
    completeOnboarding(databaseUrl, server.id);
    const anchor = await owner.chat.send.mutate({
        chatId,
        content: 'Thread search anchor',
        nonce: 'thread-search-anchor',
        serverId: server.id,
    });
    anchorMessageId = anchor.message.id;
    // Enough replies on each side that landing has to scroll to the match.
    const sendReply = (content: string, nonce: string) =>
        owner.chat.send.mutate({
            chatId,
            content,
            nonce,
            serverId: server.id,
            thread: { anchorMessageId },
        });
    for (let index = 0; index < 30; index += 1) {
        await sendReply(`Earlier filler ${index}`, `thread-search-before-${index}`);
    }
    const reply = await sendReply('Buried quokka reply', 'thread-search-reply');
    replySequence = reply.message.sequence;
    for (let index = 0; index < 30; index += 1) {
        await sendReply(`Later filler ${index}`, `thread-search-after-${index}`);
    }
});

test('Search finds a Thread reply and opens its Thread', async ({ page }) => {
    await signInAsAppHuman(page);
    await page.goto('/s/thread-search');
    await openChannel(page, 'all');

    // The sidebar renders as a treegrid, so its search row is a row, not a button.
    await page.getByRole('row', { name: 'Search' }).click();
    await page.getByPlaceholder('Search or run a command').fill('quokka');
    const result = page.getByRole('menuitem', { name: /Buried quokka reply/ });
    await expect(result).toContainText('Thread in #all');
    await result.click();

    await expect(page).toHaveURL(new RegExp(`thread=${anchorMessageId}&at=${replySequence}`));
    await expect(page.getByLabel('Thread').getByText('Buried quokka reply')).toBeInViewport();
});
