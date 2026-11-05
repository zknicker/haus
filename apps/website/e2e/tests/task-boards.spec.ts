import type { Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { assertOpaqueId, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a board is created, shaped, and worked, and its Tasks survive a reload', async ({ page }) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Task Boards',
        slug: 'task-boards',
    });
    await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: 'task-boards',
        token: session.accessToken,
    });

    // The Tasks row is one row until a Tasks page is open.
    await expect(sidebarRow(page, 'General')).toHaveCount(0);
    await sidebarRow(page, 'Tasks').click();
    await expect(page).toHaveURL(/\/tasks\/GEN$/u);
    await expect(sidebarRow(page, 'General')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Todo', exact: true })).toBeVisible();

    // New board lands on the board it made, with the default columns.
    await sidebarRow(page, 'New board').click();
    await page.getByLabel('Name', { exact: true }).fill('Security');
    await expect(page.getByLabel('Key', { exact: true })).toHaveValue('SEC');
    await page.getByRole('button', { name: 'Create board' }).click();
    await expect(page).toHaveURL(/\/tasks\/SEC$/u);
    await expect(sidebarRow(page, 'Security')).toBeVisible();
    for (const name of ['Backlog', 'Todo', 'In progress', 'Done']) {
        await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
    }

    // A column's add button starts the dialog on that column. The force click
    // skips actionability, so the New board dialog must finish closing first.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
        .getByRole('button', { name: 'Add task to Todo', exact: true })
        .click({ force: true });
    await page.getByLabel('Title', { exact: true }).fill('Rotate pairing tokens');
    await page.getByRole('button', { name: 'Create task' }).click();
    const todo = page.getByRole('region', { name: 'Todo', exact: true });
    await expect(taskCard(todo, 'Rotate pairing tokens')).toBeVisible();
    await expect(taskCard(todo, 'Rotate pairing tokens')).toContainText('SEC-1');

    // Drag across columns; the move lands at once and reaches the Server.
    const active = page.getByRole('region', { name: 'In progress', exact: true });
    await taskCard(todo, 'Rotate pairing tokens').dragTo(
        active.getByRole('grid', { name: 'In progress tasks' })
    );
    await expect(taskCard(active, 'Rotate pairing tokens')).toBeVisible();
    await expect
        .poll(async () => (await readBoardTask(client, server.id, 'SEC-1')).category)
        .toBe('active');

    // The card menu reaches any column without a drag.
    await taskCard(active, 'Rotate pairing tokens').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to' }).hover();
    await page.getByRole('menuitem', { name: 'Backlog', exact: true }).click();
    const backlog = page.getByRole('region', { name: 'Backlog', exact: true });
    await expect(taskCard(backlog, 'Rotate pairing tokens')).toBeVisible();

    // Board settings: a new column, and removing one that holds a Task asks where it goes.
    await page.getByRole('button', { name: 'Board options' }).click();
    await page.getByRole('menuitem', { name: 'Board settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Board settings' });
    await settings.getByRole('button', { name: 'Add column' }).click();
    await settings.getByLabel('Column name').last().fill('Needs review');
    await settings.getByRole('button', { name: 'Remove Backlog' }).click();
    await expect(settings.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect(settings.getByText('Choose where the Tasks in Backlog go.')).toBeVisible();
    await settings.getByRole('button', { name: /Move Tasks from Backlog/u }).click();
    await page.getByRole('option', { name: 'Todo', exact: true }).click();
    // The last column of a required category locks.
    await expect(settings.getByRole('button', { name: 'Remove Done' })).toBeDisabled();
    await settings.getByRole('button', { name: 'Save' }).click();
    await expect(settings).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Needs review', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Backlog', exact: true })).toHaveCount(0);
    await expect(taskCard(todo, 'Rotate pairing tokens')).toBeVisible();

    // The label catalog lives behind the board's options.
    await page.getByRole('button', { name: 'Board options' }).click();
    await page.getByRole('menuitem', { name: 'Manage labels' }).click();
    await page.getByLabel('New task label').fill('backend');
    await page.getByRole('button', { name: 'Add label' }).click();
    await expect(page.getByLabel('Rename backend')).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    // The Task page: edit in place, assign across Agents, set the facts.
    await taskCard(todo, 'Rotate pairing tokens').click();
    await expect(page).toHaveURL(/\/tasks\/SEC\/1$/u);
    await expect(sidebarRow(page, 'Security')).toBeVisible();
    await page.getByRole('button', { name: 'Rotate pairing tokens', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    await title.fill('Rotate pairing tokens on revoke');
    await title.press('Enter');
    await expect(
        page.getByRole('heading', { name: 'Rotate pairing tokens on revoke' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add description' }).click();
    await page
        .getByRole('textbox', { name: 'Description' })
        .fill('**Revoke** must rotate the token.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('strong', { hasText: 'Revoke' })).toBeVisible();
    await page.getByRole('button', { name: /^Assignee/u }).click();
    await page.getByRole('option', { name: /Orbit/u }).click();
    await expect(page.getByRole('button', { name: /^Assignee/u })).toContainText('Orbit');
    await page.getByRole('button', { name: /^Priority/u }).click();
    await page.getByRole('option', { name: 'Urgent', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Priority/u })).toContainText('Urgent');
    await page.getByRole('button', { name: /^Labels/u }).click();
    await page.getByRole('option', { name: 'backend', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Labels/u })).toContainText('backend');

    await page.reload();
    await expect(page.getByRole('button', { name: /^Assignee/u })).toContainText('Orbit');
    await expect(page.locator('strong', { hasText: 'Revoke' })).toBeVisible();

    // Back on the board, the lens rides the URL and a reload keeps the Task where it went.
    await sidebarRow(page, 'Security').click();
    await expect(taskCard(todo, 'Rotate pairing tokens on revoke')).toBeVisible();

    // Filters narrow what shows, not what is true.
    await page.getByRole('button', { name: /^Filter by assignee/u }).click();
    await page.getByRole('option', { name: 'Unassigned', exact: true }).click();
    await expect(taskCard(todo, 'Rotate pairing tokens on revoke')).toHaveCount(0);
    await page.getByRole('button', { name: /^Filter by assignee/u }).click();
    await page.getByRole('option', { name: 'Orbit' }).click();
    await page.getByRole('button', { name: /^Filter by label/u }).click();
    await page.getByRole('option', { name: 'backend', exact: true }).click();
    await expect(taskCard(todo, 'Rotate pairing tokens on revoke')).toBeVisible();
    await expect(page).toHaveURL(/assignee=agent/u);

    await page.getByRole('radio', { name: 'List' }).click();
    await expect(page).toHaveURL(/view=list/u);
    await expect(page.getByRole('grid', { name: 'Todo tasks' })).toContainText('SEC-1');
    await page.reload();
    await expect(page.getByRole('grid', { name: 'Todo tasks' })).toContainText('SEC-1');

    // Off Tasks, the row folds back to one row.
    await page.getByRole('row', { name: 'all', exact: true }).click();
    await expect(sidebarRow(page, 'Security')).toHaveCount(0);
});

test('a Task shows what mentions it, opens it, and catches up after a reconnect', async ({
    page,
}) => {
    const { client, server } = await createTestServer(page, {
        displayName: 'Task Mentions',
        slug: 'task-mentions',
    });
    const [general] = await client.board.list.query({ serverId: server.id });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(general?.id);
    assertOpaqueId(chatId);
    const { task } = await client.task.create.mutate({
        boardId: general.id,
        serverId: server.id,
        title: 'Trace the webhook flood',
    });
    await client.chat.send.mutate({
        chatId,
        content: `Looking at ${task.key} now`,
        nonce: 'task-mention',
        serverId: server.id,
    });

    await page.goto(`/s/${server.slug}/tasks/GEN/${task.number}`);
    const mention = page.getByRole('button', { name: `Looking at ${task.key} now` });
    await expect(mention).toBeVisible();

    await page.context().setOffline(true);
    await client.task.update.mutate({
        expectedVersion: task.version,
        patch: { title: 'Trace the Trigger flood' },
        serverId: server.id,
        taskId: task.id,
    });
    await page.context().setOffline(false);
    await expect(page.getByRole('heading', { name: 'Trace the Trigger flood' })).toBeVisible();

    await mention.click();
    await expect(page).toHaveURL(new RegExp(`/chats/${chatId}`, 'u'));
    await expect(page.getByRole('complementary', { name: 'Thread' })).toContainText(
        `Looking at ${task.key} now`
    );
});

test('a stale Task address says so, and the General board stays', async ({ page }) => {
    const { server } = await createTestServer(page, {
        displayName: 'Task Addresses',
        slug: 'task-addresses',
    });
    await page.goto(`/s/${server.slug}/tasks/GEN/999`);
    await expect(page.getByText('Task not found')).toBeVisible();

    await page.goto(`/s/${server.slug}/tasks/GEN`);
    await page.getByRole('button', { name: 'Board options' }).click();
    await expect(page.getByRole('menuitem', { name: 'Archive board' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Board settings' }).click();
    await expect(page.getByLabel('Board key')).toBeDisabled();
});

function sidebarRow(page: Page, name: string) {
    return page.getByRole('treegrid', { name: 'Server' }).getByRole('row', { exact: true, name });
}

function taskCard(scope: ReturnType<Page['getByRole']>, title: string) {
    return scope.getByRole('row', { exact: true, name: title });
}

async function readBoardTask(
    client: Awaited<ReturnType<typeof createTestServer>>['client'],
    serverId: string,
    key: string
) {
    return await client.task.get.query({ key, serverId });
}
