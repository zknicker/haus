import { createAppTestFixture, signInAsAppHuman } from '../support/app-session.ts';
import { completeOnboarding, createClient, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

let anchorMessageId: string;

test.beforeAll(async () => {
    const { accessToken, databaseUrl } = await createAppTestFixture();
    const owner = createClient(accessToken);
    await owner.server.create.mutate({ displayName: 'Open Threads', slug: 'open-threads' });
    const server = await owner.server.bySlug.query({ slug: 'open-threads' });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id as string;
    completeOnboarding(databaseUrl, server.id);
    const anchor = await owner.chat.send.mutate({
        chatId,
        content: 'Should we ship the quokka migration?',
        nonce: 'open-threads-anchor',
        serverId: server.id,
    });
    anchorMessageId = anchor.message.id;
    await owner.chat.send.mutate({
        chatId,
        content: 'Asking in a Thread.',
        nonce: 'open-threads-reply',
        serverId: server.id,
        thread: { anchorMessageId },
    });
});

test('a replied Thread sits in the sidebar, opens, closes, and files under Earlier', async ({
    page,
}) => {
    await signInAsAppHuman(page);
    await page.goto('/s/open-threads');
    await openChannel(page, 'all');

    const sidebarRow = page.getByRole('row', { name: /Should we ship the quokka migration/ });
    await expect(sidebarRow).toContainText('Waiting for a reply');
    await expect(sidebarRow).toContainText('#all');
    await page.screenshot({ path: 'test-results/open-threads-sidebar.png' });

    await sidebarRow.click();
    await expect(page).toHaveURL(new RegExp(`thread=${anchorMessageId}`));

    await page.getByRole('link', { name: 'All threads' }).click();
    await expect(page).toHaveURL(/\/threads$/);
    await expect(page.getByRole('heading', { name: 'With agents' })).toBeVisible();
    await page.screenshot({ path: 'test-results/open-threads-page.png' });

    await page.getByRole('button', { name: /Should we ship the quokka migration/ }).click();
    await page.getByRole('button', { name: /thread actions/ }).click();
    await page.getByRole('menuitem', { name: 'Close', exact: true }).click();
    await expect(sidebarRow).toBeHidden();

    await page.getByRole('link', { name: 'All threads' }).click();
    await expect(page.getByRole('heading', { name: 'Earlier' })).toBeVisible();
    await expect(
        page.getByRole('button', { name: /Should we ship the quokka migration/ })
    ).toBeVisible();
});
