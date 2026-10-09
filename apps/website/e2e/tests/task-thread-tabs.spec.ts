import { installDesktopBrowserStub, openDesktopWindow } from '../support/desktop-browser-stub.ts';
import { assertOpaqueId, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Task Threads render and update metadata as desktop Thread pages', async ({ page }) => {
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
    await openDesktopWindow(
        page,
        `/s/${server.slug}/chats/${chatId}?thread=${created.task.messageId}`
    );
    // A `?thread=` link opens the Task's Thread page as a new tab in the right pane, creating
    // it beside the chat (ADR 0039, amended 2026-10-08).
    const pane = page.locator('.desktop-tab-frame[data-frame-pane="secondary"]:visible');
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
    await expect(details).toBeVisible();
    await expect(
        details.getByRole('button', { name: 'Status for task #1', exact: true })
    ).toContainText('Done');
});
