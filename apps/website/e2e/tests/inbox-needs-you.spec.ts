import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const question = 'The migration is staged. Should I run it now?';

test('an @mention of the viewer is a Needs you row until Done, and newer activity brings it back', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Needs You',
        slug: 'needs-you',
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
        slug: 'needs-you',
        token: session.token,
    });
    await agent.send(`[@Ada](user://${agent.ownerUserId}) ${question}`, 'mention-1');

    await page.goto('/s/needs-you/inbox');
    const row = page.getByRole('button', { exact: true, name: 'Orbit in #all' });
    await expect(row).toBeVisible();
    const card = row.locator('xpath=..');
    await expect(card).toContainText(question);
    await expect(card).toContainText('#all');
    // The Chat has a Needs you row, so Conversations does not list it again.
    await expect(page.getByRole('button', { exact: true, name: 'all' })).toHaveCount(0);

    // Opening the row goes to the conversation, where the reply would clear it.
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/s/needs-you/chats/${agent.chatId}$`, 'u'));
    await page.goBack();

    await page.getByRole('button', { name: 'Done: Orbit' }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByText('Nothing needs you.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Nothing needs you.')).toBeVisible();
    await expect(row).toHaveCount(0);

    // Done covered only what it saw: a newer mention brings the row back live.
    await agent.send(
        `[@Ada](user://${agent.ownerUserId}) Still waiting on the migration.`,
        'mention-2'
    );
    await expect(row).toBeVisible();
    await expect(row.locator('xpath=..')).toContainText('Still waiting on the migration.');
});
