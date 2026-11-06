import { seedCloudAgentWork } from '../support/agent-cloud-agent.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const workTitle = 'Fix the failing migration';

test('the web Thread page states its work once, in the Work panel', async ({ page }) => {
    test.setTimeout(90_000);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Work Panel',
        slug: 'work-panel',
    });
    const seeded = await seedCloudAgentWork({
        agentHandle: 'orbit',
        channelName: 'all',
        computerCredential: 'computer-work-panel-credential-1234',
        content: 'Delegating the migration fix to a Cloud Agent.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug: 'work-panel',
        startingRef: 'main',
        title: workTitle,
        token: session.accessToken,
    });
    const chatId = server.channels.find((channel) => channel.name === 'all')?.id as string;
    await client.chat.send.mutate({
        chatId,
        content: 'Watching this one.',
        nonce: 'work-panel-reply',
        serverId: server.id,
        thread: { anchorMessageId: seeded.messageId },
    });

    await page.goto(`/s/work-panel/threads/${chatId}/${seeded.messageId}`);
    const panel = page.getByRole('complementary', { name: 'Work' });
    await expect(panel.getByTestId('cloud-agent-work-card')).toContainText(workTitle);
    const conversation = page.getByTestId('thread-conversation');
    await expect(conversation.getByTestId('cloud-agent-work-card')).toHaveCount(0);
    await expect(conversation.getByRole('button', { name: workTitle })).toBeVisible();
    await expect(panel.getByRole('button', { name: '#all' })).toBeVisible();

    // Closing the panel brings the card back, and the choice survives a reload.
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(conversation.getByTestId('cloud-agent-work-card')).toContainText(workTitle);
    await page.reload();
    await expect(conversation.getByTestId('cloud-agent-work-card')).toContainText(workTitle);
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await expect(panel).toBeVisible();

    // Too narrow for the panel: it and its button leave, and the card returns.
    await page.setViewportSize({ height: 720, width: 800 });
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: 'Work', exact: true })).toHaveCount(0);
    await expect(conversation.getByTestId('cloud-agent-work-card')).toContainText(workTitle);
});
