import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const question = 'The migration is staged. Should I run it now?';

test('an unread Channel is an Unread row until Mark read, and newer activity brings it back', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Inbox Unread',
        slug: 'inbox-unread',
    });
    await client.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId: server.id,
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: 'inbox-unread',
        token: session.token,
    });
    await agent.send(`[@Ada](user://${agent.ownerUserId}) ${question}`, 'unread-1');

    await page.goto('/s/inbox-unread/inbox');
    const row = page.getByRole('button', { exact: true, name: 'all' });
    await expect(row).toBeVisible();
    await expect(row.locator('xpath=..')).toContainText(question);

    await page.getByRole('button', { name: 'Mark read: #all' }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByText('All caught up.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('All caught up.')).toBeVisible();
    await expect(row).toHaveCount(0);

    // Mark read covered only what it saw: a newer message brings the row back live.
    await agent.send('Still waiting on the migration.', 'unread-2');
    await expect(row).toBeVisible();
    await expect(row.locator('xpath=..')).toContainText('Still waiting on the migration.');

    // Opening the row goes to the conversation.
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/s/inbox-unread/chats/${agent.chatId}$`, 'u'));
});
