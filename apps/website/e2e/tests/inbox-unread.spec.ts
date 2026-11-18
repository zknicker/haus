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

test('a followed Task is a queue item among Chats: J reaches it, Return opens the Task and reads it', async ({
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
    const from = await agent.send('The vault audit is due.', 'tasks-origin');
    const { key, target } = await agent.startTask({
        assignee: 'ada',
        from,
        title: 'Review the vault',
    });
    await agent.send('Starting with the admin accounts.', 'tasks-task', target);
    await agent.send('Deploy notes are posted.', 'tasks-channel');

    await page.goto('/s/inbox-tasks/inbox');
    const channelCard = page.getByRole('article', { exact: true, name: '#all' });
    const taskCard = page.getByRole('article', { exact: true, name: `${key} Review the vault` });
    await expect(channelCard).toHaveAttribute('data-selected', 'true');
    await expect(taskCard).toContainText('Starting with the admin accounts.');
    await expect(taskCard).not.toHaveAttribute('data-selected', 'true');
    await expect(
        taskCard.getByRole('textbox', { name: `Message ${key} Review the vault` })
    ).toBeVisible();
    await expect(page.getByLabel('2 waiting in Inbox')).toBeVisible();

    await page.keyboard.press('j');
    await expect(taskCard).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('k');
    await expect(channelCard).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('j');
    await expect(taskCard).toHaveAttribute('data-selected', 'true');

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/s/inbox-tasks/tasks/${key}$`, 'u'));
    await expect
        .poll(async () => (await client.task.get.query({ key, serverId: server.id })).unreadCount)
        .toBe(0);
});

test('Unread is a feed of open cards: one selected, moved by keys and pressing, read by reply or E', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Inbox Triage',
        slug: 'inbox-triage',
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
        slug: 'inbox-triage',
        token: session.accessToken,
    });
    const from = await agent.send('Can someone check the flaky deploy?', 'triage-origin');
    const { key, target } = await agent.startTask({
        assignee: 'ada',
        from,
        title: 'Fix the flaky deploy',
    });
    await agent.send('Found it: a stale cache key.', 'triage-task', target);
    await agent.send('Deploy notes are posted.', 'triage-channel');

    await page.goto('/s/inbox-triage/inbox');
    const channelRow = page.getByRole('article', { exact: true, name: '#all' });
    const taskRow = page.getByRole('article', { exact: true, name: `${key} Fix the flaky deploy` });
    const channelComposer = channelRow.getByRole('textbox', { name: 'Message all' });
    const taskComposer = taskRow.getByRole('textbox', {
        name: `Message ${key} Fix the flaky deploy`,
    });

    // Newest first, and every card is open: its newest waiting message and its
    // own composer. The first is selected, and no composer takes the cursor on
    // load.
    await expect(channelRow).toContainText('Deploy notes are posted.');
    await expect(channelRow).toHaveAttribute('data-selected', 'true');
    await expect(channelComposer).toBeVisible();
    await expect(channelComposer).not.toBeFocused();
    await expect(taskRow).toContainText('Found it: a stale cache key.');
    await expect(taskRow).not.toHaveAttribute('data-selected', 'true');
    await expect(taskComposer).toBeVisible();

    // J selects the next card and K comes back; both cards stay open.
    await page.keyboard.press('j');
    await expect(taskRow).toHaveAttribute('data-selected', 'true');
    await expect(channelRow).not.toHaveAttribute('data-selected', 'true');
    await expect(channelComposer).toBeVisible();
    await page.keyboard.press('k');
    await expect(channelRow).toHaveAttribute('data-selected', 'true');
    await expect(taskComposer).toBeVisible();

    // R puts the cursor in the selected card's composer.
    await page.keyboard.press('r');
    await expect(channelComposer).toBeFocused();

    // Moving into another card's composer selects that card in place, and a
    // reply reads it and selects the next one.
    await taskComposer.click();
    await expect(taskRow).toHaveAttribute('data-selected', 'true');
    await expect(page).toHaveURL(/\/s\/inbox-triage\/inbox$/u);
    await page.keyboard.type('Thanks, fixing it now.');
    await page.keyboard.press('Enter');
    await expect(taskRow).toHaveCount(0);
    await expect(channelRow).toHaveAttribute('data-selected', 'true');
    await expect
        .poll(async () => (await client.task.get.query({ key, serverId: server.id })).unreadCount)
        .toBe(0);

    // E marks the selected card read.
    await page.keyboard.press('e');
    await expect(channelRow).toHaveCount(0);
    await expect(page.getByText('All caught up.')).toBeVisible();
});
