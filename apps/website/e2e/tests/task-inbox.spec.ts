import type { Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const title = 'Renew the Tailscale auth key';

async function startedTask(page: Page, slug: string) {
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
    const from = await agent.send('The Tailscale key expires Friday.', `${slug}-origin`);
    const { shortId } = await agent.startTask({ from, title });
    return { agent, client, serverId: server.id, shortId };
}

test('a Task reference in a message is a chip that previews and opens the Task', async ({
    page,
}) => {
    const { agent, client, serverId, shortId } = await startedTask(page, 'task-inbox-chip');
    await client.chat.send.mutate({
        chatId: agent.chatId,
        content: `[${title}](task://${shortId}) needs an admin login.`,
        nonce: 'task-inbox-chip-reference',
        serverId,
    });

    await page.goto(`/s/task-inbox-chip/chats/${agent.chatId}`);
    const chip = page.getByRole('button', { exact: true, name: `Open ${title}` });
    await expect(chip).toBeVisible();

    const preview = page.getByRole('tooltip');
    await expect(async () => {
        await page.mouse.move(0, 0);
        await chip.hover();
        await expect(preview).toContainText(title, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await expect(preview).toContainText('Started by');

    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/s/task-inbox-chip/tasks/${shortId}$`, 'u'));
});
