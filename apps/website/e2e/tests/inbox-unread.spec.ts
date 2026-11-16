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
        token: session.accessToken,
    });
    await agent.send(`[@Ada](user://${agent.ownerUserId}) ${question}`, 'unread-1');

    await page.goto('/s/inbox-unread/inbox');
    const row = page.getByRole('button', { exact: true, name: 'all' });
    await expect(row).toBeVisible();
    // The only row is the open one, rendering the waiting message itself (ADR 0050).
    await expect(row.locator('xpath=ancestor::article')).toContainText(question);

    await page.getByRole('button', { name: 'Mark read: #all' }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByText('All caught up.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('All caught up.')).toBeVisible();
    await expect(row).toHaveCount(0);

    // Mark read covered only what it saw: a newer message brings the row back live.
    await agent.send('Still waiting on the migration.', 'unread-2');
    await expect(row).toBeVisible();
    await expect(row.locator('xpath=ancestor::article')).toContainText(
        'Still waiting on the migration.'
    );

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
        token: session.accessToken,
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
    await expect(threadRow.locator('xpath=ancestor::article')).toContainText(
        'Found it: a stale cache key.'
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

test('a Task card is a queue item among Chats: J reaches it, Return opens the Task and clears it', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Inbox Tasks',
        slug: 'inbox-tasks',
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
        slug: 'inbox-tasks',
        token: session.accessToken,
    });
    const { key } = await agent.createTask({
        assignee: 'ada',
        board: 'GEN',
        title: 'Review the vault',
    });
    // Newer than the assignment, so the Channel leads the feed.
    await agent.send('Deploy notes are posted.', 'tasks-channel');

    await page.goto('/s/inbox-tasks/inbox');
    const channelCard = page.getByRole('article', { exact: true, name: '#all' });
    const taskCard = page.getByRole('article', { name: `${key}: Review the vault` });
    await expect(channelCard).toHaveAttribute('data-selected', 'true');
    await expect(taskCard).toBeVisible();
    await expect(taskCard).not.toHaveAttribute('data-selected', 'true');
    // A Task with no message referencing it has no conversation to reply in.
    await expect(taskCard.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByLabel('2 waiting in Inbox')).toBeVisible();

    await page.keyboard.press('j');
    await expect(taskCard).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('k');
    await expect(channelCard).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('j');
    await expect(taskCard).toHaveAttribute('data-selected', 'true');

    await page.keyboard.press('Enter');
    const [board, number] = key.split('-');
    await expect(page).toHaveURL(new RegExp(`/s/inbox-tasks/tasks/${board}/${number}$`, 'u'));
    await expect
        .poll(async () => (await client.taskInbox.list.query({ serverId: server.id })).items)
        .toEqual([]);
});

test('Unread is a feed of open cards: one selected, moved by keys and pressing, read by reply or E', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Inbox Triage',
        slug: 'inbox-triage',
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: 'inbox-triage',
        token: session.accessToken,
    });
    const root = await client.chat.send.mutate({
        chatId: agent.chatId,
        content: 'Can someone check the flaky deploy?',
        nonce: 'triage-root',
        serverId: server.id,
    });
    await agent.send('Found it: a stale cache key.', 'triage-thread', `#all:${root.message.id}`);
    await agent.send('Deploy notes are posted.', 'triage-channel');

    await page.goto('/s/inbox-triage/inbox');
    const channelRow = page.getByRole('article', { exact: true, name: '#all' });
    const threadRow = page.getByRole('article', { exact: true, name: 'Thread in #all' });
    const channelComposer = channelRow.getByRole('textbox', { name: 'Message all' });
    const threadComposer = threadRow.getByRole('textbox', { name: 'Message Thread — #all' });

    // Newest first, and every card is open: its newest waiting message and its
    // own composer. The first is selected, and no composer takes the cursor on
    // load.
    await expect(channelRow).toContainText('Deploy notes are posted.');
    await expect(channelRow).toHaveAttribute('data-selected', 'true');
    await expect(channelComposer).toBeVisible();
    await expect(channelComposer).not.toBeFocused();
    await expect(threadRow).toContainText('Found it: a stale cache key.');
    await expect(threadRow).not.toHaveAttribute('data-selected', 'true');
    await expect(threadComposer).toBeVisible();

    // J selects the next card and K comes back; both cards stay open.
    await page.keyboard.press('j');
    await expect(threadRow).toHaveAttribute('data-selected', 'true');
    await expect(channelRow).not.toHaveAttribute('data-selected', 'true');
    await expect(channelComposer).toBeVisible();
    await page.keyboard.press('k');
    await expect(channelRow).toHaveAttribute('data-selected', 'true');
    await expect(threadComposer).toBeVisible();

    // R puts the cursor in the selected card's composer.
    await page.keyboard.press('r');
    await expect(channelComposer).toBeFocused();

    // Moving into another card's composer selects that card in place, and a
    // reply reads it and selects the next one.
    await threadComposer.click();
    await expect(threadRow).toHaveAttribute('data-selected', 'true');
    await expect(page).toHaveURL(/\/s\/inbox-triage\/inbox$/u);
    await page.keyboard.type('Thanks, fixing it now.');
    await page.keyboard.press('Enter');
    await expect(threadRow).toHaveCount(0);
    await expect(channelRow).toHaveAttribute('data-selected', 'true');
    await expect
        .poll(async () => (await client.thread.listUnread.query({ serverId: server.id })).threads)
        .toEqual([]);

    // E marks the selected card read.
    await page.keyboard.press('e');
    await expect(channelRow).toHaveCount(0);
    await expect(page.getByText('All caught up.')).toBeVisible();
});
