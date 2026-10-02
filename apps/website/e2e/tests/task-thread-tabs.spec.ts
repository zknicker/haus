import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Task Threads render and update metadata in desktop workspace tabs', async ({ page }) => {
    await installDesktopBrowserStub(page);
    const { client, server } = await createTestServer(page, {
        displayName: 'Task Thread tabs',
        slug: 'task-thread-tabs',
    });
    const chatId = server.channels.find((chat) => chat.name === 'all')?.id;
    assertOpaqueId(chatId);
    const created = await client.task.create.mutate({
        serverId: server.id,
        chatId,
        content: 'Inspect Task Thread metadata',
        nonce: 'task-thread-tab-root',
    });
    await page.goto(`/#/s/${server.slug}/chats/${chatId}?thread=${created.task.messageId}`);
    const pane = page.getByRole('complementary', { name: 'Side pane' });
    const details = page.getByRole('region', { name: 'Task #1 details' });
    await expect(pane.getByRole('region', { name: 'Task #1 details' })).toBeVisible();
    await expect(details.getByText('Created by', { exact: true })).toBeVisible();
    await details.getByRole('button', { name: 'Status for task #1', exact: true }).click();
    await page.getByRole('option', { name: 'Done', exact: true }).click();
    await expect
        .poll(
            async () =>
                (await client.task.list.query({ serverId: server.id, chatId })).tasks[0]?.task
                    .status
        )
        .toBe('done');
    await details.getByRole('button', { name: 'Assignee for task #1', exact: true }).click();
    await expect(page.getByRole('option', { name: 'Unassigned', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open as tabs', exact: true }).click();
    await expect(details).toBeVisible();
    await expect(
        details.getByRole('button', { name: 'Status for task #1', exact: true })
    ).toContainText('Done');
});
