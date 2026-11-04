import type { Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const title = 'Renew the Tailscale auth key';

/**
 * A Server where the Agent assigned the viewer one Task, and the viewer's own
 * message references it, so nothing but the Task is waiting in the Inbox.
 */
async function assignedTask(page: Page, slug: string) {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Task Inbox',
        slug,
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
        slug,
        token: session.accessToken,
    });
    const { key } = await agent.createTask({
        assignee: 'ada',
        board: 'GEN',
        priority: 'high',
        title,
    });
    const context = await client.chat.send.mutate({
        chatId: agent.chatId,
        content: `${key} needs an admin login.`,
        nonce: `${slug}-context`,
        serverId: server.id,
    });
    return {
        agent,
        card: page.getByRole('article', { name: `${key}: ${title}` }),
        client,
        contextMessageId: context.message.id,
        key,
        serverId: server.id,
    };
}

test('an assignment is a card with its context message; Done resolves in place, Undo restores', async ({
    page,
}) => {
    const { card, client, key, serverId } = await assignedTask(page, 'task-inbox-resolve');
    const itemCount = async () => (await client.taskInbox.list.query({ serverId })).items.length;
    const category = async () => (await client.task.get.query({ key, serverId })).category;

    await page.goto('/s/task-inbox-resolve/inbox');
    await expect(card).toContainText(`${key} · Orbit assigned you`);
    await expect(card).toContainText(title);
    await expect(card).toContainText('General');
    await expect(card.getByRole('img', { name: 'High priority' })).toBeVisible();
    await expect(card).toContainText('needs an admin login.');
    await expect(card.getByRole('button', { name: `Status of ${key}` })).toContainText('Todo');
    // The badge counts the Task item, the only thing waiting.
    await expect(page.getByLabel('1 unread chats')).toBeVisible();

    await card.getByRole('button', { exact: true, name: 'Done' }).click();
    const resolved = page.getByRole('status').filter({ hasText: `${key} moved to Done.` });
    await expect(resolved).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect(page.getByLabel('1 unread chats')).toHaveCount(0);
    await expect.poll(category).toBe('done');
    await expect.poll(itemCount).toBe(0);

    await resolved.getByRole('button', { exact: true, name: 'Undo' }).click();
    await expect(card).toBeVisible();
    await expect(resolved).toHaveCount(0);
    await expect(page.getByLabel('1 unread chats')).toBeVisible();
    await expect.poll(category).toBe('todo');
    await expect.poll(itemCount).toBe(1);

    // The status picker reaches any column, and resolves the same way.
    await card.getByRole('button', { name: `Status of ${key}` }).click();
    await page.getByRole('option', { exact: true, name: 'Backlog' }).click();
    await expect(
        page.getByRole('status').filter({ hasText: `${key} moved to Backlog.` })
    ).toBeVisible();
    await expect(card).toHaveCount(0);
    await expect.poll(category).toBe('backlog');
    await expect.poll(itemCount).toBe(0);
});

test("a reply from the card posts in the context message's Thread and leaves the Task waiting", async ({
    page,
}) => {
    const { agent, card, client, contextMessageId, serverId } = await assignedTask(
        page,
        'task-inbox-reply'
    );

    await page.goto('/s/task-inbox-reply/inbox');
    await expect(card).toBeVisible();

    // R puts the cursor in the selected card's composer, as on any card.
    const composer = card.getByRole('textbox', { name: 'Message Thread — #all' });
    await page.keyboard.press('r');
    await expect(composer).toBeFocused();
    await page.keyboard.type('On it after standup.');
    await page.keyboard.press('Enter');
    await expect(composer).toHaveText('');

    await expect(card).toBeVisible();
    await expect
        .poll(async () => (await client.taskInbox.list.query({ serverId })).items.length)
        .toBe(1);

    await page.goto(`/s/task-inbox-reply/chats/${agent.chatId}?thread=${contextMessageId}`);
    await expect(
        page
            .getByRole('region', { name: 'Thread messages' })
            .getByText('On it after standup.', { exact: true })
    ).toBeVisible();
});

test('E clears the card without moving the Task', async ({ page }) => {
    const { card, client, key, serverId } = await assignedTask(page, 'task-inbox-clear');

    await page.goto('/s/task-inbox-clear/inbox');
    await expect(card).toBeVisible();

    await page.keyboard.press('e');
    await expect(card).toHaveCount(0);
    await expect(page.getByText('All caught up.')).toBeVisible();
    await expect
        .poll(async () => (await client.taskInbox.list.query({ serverId })).items.length)
        .toBe(0);
    expect((await client.task.get.query({ key, serverId })).category).toBe('todo');

    await page.reload();
    await expect(page.getByText('All caught up.')).toBeVisible();
});

test('Convert to Task files the message on a board and offers to open it', async ({ page }) => {
    const { agent, client, contextMessageId, serverId } = await assignedTask(
        page,
        'task-inbox-convert'
    );

    await page.goto(`/s/task-inbox-convert/chats/${agent.chatId}`);
    await page.locator(`[data-message-id="${contextMessageId}"]`).click({ button: 'right' });
    await page.getByRole('menuitem', { exact: true, name: 'Convert to Task' }).click();

    const dialog = page.getByRole('dialog', { name: 'Convert to Task' });
    const titleField = dialog.getByRole('textbox', { name: 'Title' });
    await expect(titleField).toHaveValue(/needs an admin login\.$/u);
    await titleField.fill('Get an admin login for the Mac mini');
    await dialog.getByRole('button', { exact: true, name: 'Create Task' }).click();
    await expect(dialog).toHaveCount(0);

    const tasks = await client.task.list.query({ serverId });
    const created = tasks.find((task) => task.title === 'Get an admin login for the Mac mini');
    if (!created) {
        throw new Error('Convert to Task did not create the Task.');
    }
    const detail = await client.task.get.query({ key: created.key, serverId });
    expect(detail.mentions.map((mention) => mention.messageId)).toContain(contextMessageId);

    await page.getByRole('button', { exact: true, name: 'Open task' }).click();
    const [board, number] = created.key.split('-');
    await expect(page).toHaveURL(
        new RegExp(`/s/task-inbox-convert/tasks/${board}/${number}$`, 'u')
    );
});

test('a bare Task key in a message is a chip that previews and opens the Task', async ({
    page,
}) => {
    const { agent, key } = await assignedTask(page, 'task-inbox-chip');

    await page.goto(`/s/task-inbox-chip/chats/${agent.chatId}`);
    const chip = page.getByRole('button', { exact: true, name: `Open ${key}` });
    await expect(chip).toBeVisible();

    const preview = page.getByRole('tooltip');
    await expect(async () => {
        await page.mouse.move(0, 0);
        await chip.hover();
        await expect(preview).toContainText(title, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await expect(preview).toContainText('Todo');
    await expect(preview).toContainText('General');
    await expect(preview).toContainText('High');

    await chip.click();
    const [board, number] = key.split('-');
    await expect(page).toHaveURL(new RegExp(`/s/task-inbox-chip/tasks/${board}/${number}$`, 'u'));
});
