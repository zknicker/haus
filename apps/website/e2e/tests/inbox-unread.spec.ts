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

test('a followed Thread is its own Unread row, apart from its Channel, and opens the Thread', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Inbox Threads',
        slug: 'inbox-threads',
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: 'inbox-threads',
        token: session.token,
    });
    // The viewer wrote the anchor, so the Agent's first reply follows them to its Thread.
    const root = await client.chat.send.mutate({
        chatId: agent.chatId,
        content: 'Can someone check the flaky deploy?',
        nonce: 'thread-root',
        serverId: server.id,
    });
    const threadTarget = `#all:${root.message.id}`;
    await agent.send('Found it: a stale cache key.', 'thread-reply-1', threadTarget);

    await page.goto('/s/inbox-threads/inbox');
    const threadRow = page.getByRole('button', { exact: true, name: 'Thread in #all' });
    await expect(threadRow).toBeVisible();
    await expect(threadRow.locator('xpath=..')).toContainText(
        'Orbit replied in thread: Found it: a stale cache key.'
    );
    // The reply lives in the Thread, so the Channel itself is not unread.
    await expect(page.getByRole('button', { exact: true, name: 'all' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Mark read: Thread in #all' }).click();
    await expect(threadRow).toHaveCount(0);
    await expect(page.getByText('All caught up.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('All caught up.')).toBeVisible();

    // A newer reply brings the Thread back live, and opening it opens the Thread.
    await agent.send('Fix is deployed.', 'thread-reply-2', threadTarget);
    await expect(threadRow).toBeVisible();
    await threadRow.click();
    await expect(page).toHaveURL(
        new RegExp(`/s/inbox-threads/chats/${agent.chatId}\\?thread=${root.message.id}$`, 'u')
    );
    await expect(
        page
            .getByRole('region', { name: 'Thread messages' })
            .getByText('Fix is deployed.', { exact: true })
    ).toBeVisible();

    // Landing on the reply showed it, so viewing read it (a reply landed flush
    // under the scroller's top inset once read as unseen).
    await expect
        .poll(async () => (await client.thread.listUnread.query({ serverId: server.id })).threads)
        .toEqual([]);
    await page.goto('/s/inbox-threads/inbox');
    await expect(page.getByText('All caught up.')).toBeVisible();
});
