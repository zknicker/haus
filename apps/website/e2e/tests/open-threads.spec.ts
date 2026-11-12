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

    // The viewer wrote in it, so it is theirs to come back to; one line, no status claim.
    const sidebarRow = page.getByRole('row', { name: /Should we ship the quokka migration/ });
    await expect(sidebarRow).toBeVisible();
    await expect(sidebarRow).not.toContainText('Waiting');
    await expect(sidebarRow).not.toContainText('#all');
    await page.screenshot({ path: 'test-results/open-threads-sidebar.png' });

    await sidebarRow.click();
    await expect(page).toHaveURL(new RegExp(`/threads/.+/${anchorMessageId}$`));

    await page.getByRole('link', { name: 'All threads' }).click();
    await expect(page).toHaveURL(/\/threads$/);
    await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
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

    // The Preferences switch hides the section on this device, and it stays hidden.
    await page.goto('/s/open-threads/settings/preferences');
    await page.getByRole('switch', { name: 'Show open threads' }).click({ force: true });
    await expect(page.getByRole('link', { name: 'All threads' })).toHaveCount(0);
    await page.goto('/s/open-threads');
    await openChannel(page, 'all');
    await expect(page.getByRole('link', { name: 'All threads' })).toHaveCount(0);
});
