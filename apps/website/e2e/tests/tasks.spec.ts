import type { Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { e2eClerkUserId } from '../support/clerk-session.ts';
import { createTestServer, openChannel, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('hosted task board survives reconnect and loses tasks with parent Chat access', async ({
    page,
}) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Hosted Tasks',
        slug: 'tasks',
    });
    await page.goto('/s/tasks/tasks');

    await page.getByRole('button', { name: 'New task' }).click();
    // Pin the anchor Chat: the dialog defaults to the most recently active
    // chat, which on a fresh Server is Cove's onboarding channel once its
    // first message lands — a race this test must not depend on.
    await page.getByRole('button', { name: /Chat/u }).click();
    await page.getByRole('option', { name: '#all' }).click();
    await page.getByPlaceholder('What needs to be done?').fill('Prove the hosted task flow');
    await page.getByRole('button', { name: 'Create task' }).click();

    // The default lens is the Linear-style list, and opening a row shows the
    // task Thread in a dialog over the tasks page rather than navigating.
    await page.getByRole('button', { name: /Open task #1 Prove the hosted task flow/u }).click();
    const dialog = page.getByRole('dialog', { name: 'Task #1 thread' });
    await expect(dialog.getByRole('region', { name: 'Task #1 details' })).toBeVisible();
    await expect(dialog.getByText('Prove the hosted task flow', { exact: true })).toBeVisible();
    // The dialog holds two scroll containers (task details above the anchor,
    // and the Thread itself); the horizontal-overflow claim is about the Thread.
    const threadViewport = dialog.getByTestId('thread-conversation');
    await expect
        .poll(() => threadViewport.evaluate((element) => element.scrollWidth - element.clientWidth))
        .toBeLessThanOrEqual(0);
    await dialog.getByRole('button', { name: 'Close thread' }).click();
    await expect(dialog).toHaveCount(0);

    // Inline metadata controls live on the board cards, so switch lenses for
    // the control flow below. The lens lives in the topbar's display menu.
    await selectTaskLens(page, 'Board');

    let card = taskCard(page);
    await expect(card).toBeVisible();
    // Tasks are Agent work: a person hands a task to an Agent, never claims it.
    await expect(card.getByRole('button', { name: 'Claim' })).toHaveCount(0);

    const status = taskControl(card, 'Status');
    await status.click();
    await page.getByRole('option', { name: 'In progress' }).click();
    card = taskCard(page);
    await expect(taskControl(card, 'Status')).toContainText('In progress');

    await page.getByRole('button', { name: 'Manage Labels' }).click();
    await page.getByLabel('New task label').fill('backend');
    await page.getByRole('button', { name: 'Add label' }).click();
    const renameLabel = page.getByLabel('Rename backend');
    await renameLabel.fill('review');
    await renameLabel.press('Enter');
    await expect(page.getByLabel('Rename review')).toBeVisible();
    const labelRow = page.getByLabel('Rename review').locator('xpath=ancestor::li');
    await labelRow.getByRole('button', { name: /^Color:/u }).click();
    await page.getByRole('button', { name: 'Purple' }).click();
    await page.getByRole('button', { name: 'Done' }).click();

    card = taskCard(page);
    const priority = taskControl(card, 'Priority');
    await priority.click();
    await page.getByRole('option', { name: 'Urgent' }).click();
    await expect(taskControl(taskCard(page), 'Priority')).toContainText('Urgent');
    await taskCard(page).getByRole('button', { name: 'Labels for task #1' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'review' }).click();
    await expect(taskCard(page).getByText('review', { exact: true })).toBeVisible();

    // Any member of the Chat may hand the task to one of its Agents; the
    // picker lists Agents only.
    await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug: 'tasks',
        token: session.token,
    });
    await page.reload();
    card = taskCard(page);
    await taskControl(card, 'Assignee').click();
    await expect(page.getByRole('option', { name: /member$/u })).toHaveCount(0);
    await page.getByRole('option', { name: /Orbit\s*@orbit$/u }).click();
    await expect(taskControl(taskCard(page), 'Assignee')).toContainText('Orbit');

    const snapshot = await client.task.list.query({ serverId: server.id });
    const task = snapshot.tasks[0]?.task;
    if (!task) {
        throw new Error('The hosted task flow did not resolve its task.');
    }

    await page.context().setOffline(true);
    await client.task.assign.mutate({
        assignee: null,
        expectedVersion: task.version,
        messageId: task.messageId,
        serverId: server.id,
    });
    await page.context().setOffline(false);
    await expect(taskControl(taskCard(page), 'Assignee')).toContainText('Unassigned');

    const userId = runPsql(
        session.databaseUrl,
        `select id from users where clerk_user_id = '${e2eClerkUserId}'`
    );
    runPsql(
        session.databaseUrl,
        `delete from channel_participants
         where server_id = '${server.id}' and user_id = '${userId}'`
    );
    await page.reload();
    await expect(page.getByText('No tasks yet')).toBeVisible();
    await expect(page.getByText('Prove the hosted task flow', { exact: true })).toHaveCount(0);
});

test('a hosted task message projects its status in the Chat and opens its Thread', async ({
    page,
}) => {
    const { client, server } = await createTestServer(page, {
        displayName: 'Task Projection',
        slug: 'task-projection',
    });
    await openChannel(page, 'all');

    await page.getByRole('textbox', { name: 'Message all' }).fill('Projected task message');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Projected task message', { exact: true })).toBeVisible();

    const allChatId = server.channels.find((chat) => chat.name === 'all')?.id;
    if (!allChatId) {
        throw new Error('The task projection flow did not resolve #all.');
    }
    // The visible row above may still be the optimistic one, so wait for the
    // Server to own the message before promoting it.
    await expect
        .poll(async () => {
            const snapshot = await client.chat.messages.query({
                chatId: allChatId,
                serverId: server.id,
            });
            return snapshot.messages.some(
                (message) => message.content === 'Projected task message'
            );
        })
        .toBe(true);
    const snapshot = await client.chat.messages.query({ chatId: allChatId, serverId: server.id });
    const anchor = snapshot.messages.find(
        (message) => message.content === 'Projected task message'
    );
    if (!anchor) {
        throw new Error('The task projection flow did not resolve its anchor message.');
    }

    const promotion = await client.task.promote.mutate({
        messageId: anchor.id,
        serverId: server.id,
    });

    await expect(page.getByText('Projected task message', { exact: true })).toBeVisible();
    // Task identity is the header of the recessed Thread surface beneath the
    // message — the same slot Cloud Agent work uses — and that whole
    // surface is the way into the work. The author line carries provenance only.
    const chip = page.getByTestId('message-task-chip');
    const openThread = page.getByRole('button', { name: /^Open thread, Task #1/u });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Task #1');
    await expect(page.getByTestId('message-task-mark')).toHaveCount(0);
    await expect(openThread).toBeVisible();

    // A status change rides the same task realtime invalidation; no reload.
    await client.task.update.mutate({
        expectedVersion: promotion.task.version,
        messageId: anchor.id,
        patch: { status: 'in_progress' },
        serverId: server.id,
    });
    await expect(chip).toContainText('In progress');

    await openThread.click();
    const thread = page.getByRole('complementary', { name: 'Thread' });
    await expect(thread).toBeVisible();
    await expect(thread.getByRole('region', { name: 'Task #1 details' })).toBeVisible();
    // The panel above the anchor states the task in full, so the anchor's own
    // chip would say every word of it twice.
    await expect(thread.getByTestId('message-task-chip')).toHaveCount(0);
    await expect(thread.getByRole('button', { name: 'Status for task #1' })).toContainText(
        'In progress'
    );
});

function taskCard(page: Page) {
    return page.getByRole('row', { exact: true, name: 'Prove the hosted task flow' });
}

function taskControl(card: ReturnType<typeof taskCard>, name: 'Assignee' | 'Priority' | 'Status') {
    return card.getByRole('button', { name: new RegExp(`${name} for task #1$`, 'u') });
}

/** The list/board lens lives behind the topbar's display-options menu. */
async function selectTaskLens(page: Page, lens: 'Board' | 'List') {
    await page.getByRole('button', { name: 'Display options' }).click();
    await page.getByLabel('Task layout').getByText(lens).click();
    await page.keyboard.press('Escape');
}
