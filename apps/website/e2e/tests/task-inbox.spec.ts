import type { Page } from '@playwright/test';
import { createChannelAgent } from '../support/channel-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const title = 'Renew the Tailscale auth key';

async function followedTask(page: Page, slug: string) {
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
        channelName: 'haus',
        databaseUrl: session.databaseUrl,
        serverId: server.id,
        slug,
        token: session.accessToken,
    });
    const from = await agent.send('The Tailscale key expires Friday.', `${slug}-origin`);
    const { key, target } = await agent.startTask({ assignee: 'ada', from, title });
    await agent.send('It needs an admin login to renew.', `${slug}-task`, target);
    const detail = await client.task.get.query({ key, serverId: server.id });
    if (!detail.chatId) {
        throw new Error('A started Task has its own Chat.');
    }
    return {
        agent,
        card: page.getByRole('article', { exact: true, name: `${key} ${title}` }),
        client,
        key,
        serverId: server.id,
        taskChatId: detail.chatId,
    };
}

test('an assigned Task is followed: its message is an Inbox card, and a reply posts in the Task', async ({
    page,
}) => {
    const { card, client, key, serverId, taskChatId } = await followedTask(
        page,
        'task-inbox-reply'
    );

    await page.goto('/s/task-inbox-reply/inbox');
    await expect(card).toContainText('It needs an admin login to renew.');
    await expect(card).toContainText('#haus');
    await card.click();
    await expect(card).toHaveAttribute('data-selected', 'true');

    const composer = card.getByRole('textbox', { name: `Message ${key} ${title}` });
    await page.keyboard.press('r');
    await expect(composer).toBeFocused();
    await page.keyboard.type('On it after standup.');
    await page.keyboard.press('Enter');
    await expect(composer).toHaveText('');
    await expect(card).toHaveCount(0);
    await expect
        .poll(async () => {
            const transcript = await client.chat.messages.query({ chatId: taskChatId, serverId });
            return transcript.messages.map((message) => message.content);
        })
        .toContain('On it after standup.');
});

test('E reads the Task card without changing the Task', async ({ page }) => {
    const { card, client, key, serverId } = await followedTask(page, 'task-inbox-clear');

    await page.goto('/s/task-inbox-clear/inbox');
    await card.click();
    await expect(card).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('e');
    await expect(card).toHaveCount(0);
    expect((await client.task.get.query({ key, serverId })).state).toBe('open');

    await page.reload();
    await expect(page.getByRole('article', { name: /Renew the Tailscale/u })).toHaveCount(0);
});

test('a bare Task key in a message is a chip that previews and opens the Task', async ({
    page,
}) => {
    const { agent, client, key, serverId } = await followedTask(page, 'task-inbox-chip');
    await client.chat.send.mutate({
        chatId: agent.chatId,
        content: `${key} needs an admin login.`,
        nonce: 'task-inbox-chip-reference',
        serverId,
    });

    await page.goto(`/s/task-inbox-chip/chats/${agent.chatId}`);
    const chip = page.getByRole('button', { exact: true, name: `Open ${key}` });
    await expect(chip).toBeVisible();

    const preview = page.getByRole('tooltip');
    await expect(async () => {
        await page.mouse.move(0, 0);
        await chip.hover();
        await expect(preview).toContainText(title, { timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    await expect(preview).toContainText('Open');
    await expect(preview).toContainText('Ada');

    await chip.click();
    await expect(page).toHaveURL(new RegExp(`/s/task-inbox-chip/tasks/${key}$`, 'u'));
});
