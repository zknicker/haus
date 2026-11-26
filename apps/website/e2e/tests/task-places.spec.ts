import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const title = 'Rotate the webhook signing secret';
const brief = 'Rotate the leaked webhook secret and revoke the old one.';
const originLine = 'The webhook secret leaked into a log. Rotating it now.';

test('an Agent-started Task previews under its origin, opens as a place, and archives out of the sidebar', async ({
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

    const { shortId } = await agent.startTask({ brief, from: originId, title });
    const preview = origin.getByRole('button', {
        name: new RegExp(`^Open task ${title}, Active`, 'u'),
    });
    await expect(preview).toBeVisible();

    const sidebarRow = page
        .getByRole('treegrid', { exact: true, name: 'Tasks' })
        .getByRole('row', { name: new RegExp(title, 'u') });
    await expect(sidebarRow).toBeVisible();

    await preview.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/tasks/${shortId}$`, 'u'));
    await expect(page.getByRole('button', { name: /^Started from #all, Orbit: / })).toBeVisible();
    await expect(page.getByText(brief, { exact: true })).toBeVisible();

    const composer = page.getByRole('textbox', { name: `Message ${title}` });
    await composer.click();
    await page.keyboard.type('Thanks, ping me when the old one is revoked.');
    await page.keyboard.press('Enter');
    await expect(composer).toHaveText('');
    await expect(
        page.getByText('Thanks, ping me when the old one is revoked.', { exact: true })
    ).toBeVisible();
    const detail = await client.task.get.query({ serverId: server.id, shortId });
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
    await page.getByRole('option', { exact: true, name: 'Archived' }).click();
    await expect
        .poll(
            async () => (await client.task.get.query({ serverId: server.id, shortId })).archivedAt
        )
        .not.toBeNull();
    await expect(sidebarRow).toHaveCount(0);

    await page.goto(`/s/${slug}/tasks?view=archived`);
    await expect(page.getByRole('row', { name: new RegExp(`^${title}`, 'u') })).toBeVisible();
});
