import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const title = 'Rotate the webhook signing secret';
const originLine = 'The webhook secret leaked into a log. Rotating it now.';

test('an Agent-started Task previews under its origin, opens as a place, and closes out of the sidebar', async ({
    page,
}) => {
    const slug = 'task-places';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Task Places',
        slug,
    });
    const agent = await createChannelAgent({
        channelName: 'all',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug,
        token: session.accessToken,
    });
    const originId = await agent.send(originLine, 'task-places-origin');

    await page.goto(`/s/${slug}/chats/${agent.chatId}`);
    const origin = page.locator(`[data-message-id="${originId}"]`);
    await expect(origin).toContainText(originLine);

    const { key } = await agent.startTask({ from: originId, title });
    const preview = origin.getByRole('button', { name: `Open task ${key}, ${title}, Open` });
    await expect(preview).toBeVisible();

    const sidebarRow = page
        .getByRole('treegrid', { exact: true, name: 'Tasks' })
        .getByRole('row', { exact: true, name: `${key} ${title}` });
    await expect(sidebarRow).toBeVisible();

    await preview.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/tasks/${key}$`, 'u'));
    await expect(page.getByRole('button', { name: /^Started from #all, Orbit: / })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Details' })).toBeVisible();
    await expect(page.getByText('No messages yet')).toBeVisible();

    const composer = page.getByRole('textbox', { name: `Message ${key} ${title}` });
    await composer.click();
    await page.keyboard.type('Thanks, ping me when the old one is revoked.');
    await page.keyboard.press('Enter');
    await expect(composer).toHaveText('');
    const conversation = page.getByRole('region', { name: `${key} ${title}` });
    await expect(
        conversation.getByText('Thanks, ping me when the old one is revoked.', { exact: true })
    ).toBeVisible();
    const detail = await client.task.get.query({ key, serverId: server.id });
    if (!detail.chatId) {
        throw new Error('A started Task has its own Chat.');
    }
    const taskChatId = detail.chatId;
    await expect
        .poll(async () => {
            const messages = await client.chat.messages.query({
                chatId: taskChatId,
                serverId: server.id,
            });
            return messages.messages.map((message) => message.content);
        })
        .toContain('Thanks, ping me when the old one is revoked.');

    await page.getByRole('button', { name: /^State/u }).click();
    await page.getByRole('option', { exact: true, name: 'Done' }).click();
    await expect
        .poll(async () => (await client.task.get.query({ key, serverId: server.id })).state)
        .toBe('done');
    await expect(sidebarRow).toHaveCount(0);

    await page.goto(`/s/${slug}/tasks`);
    const row = page.getByRole('row', { name: new RegExp(`^${key} ${title}`, 'u') });
    await expect(row).toBeVisible();
    await expect(row.getByRole('img', { exact: true, name: 'Done' })).toBeVisible();
});
