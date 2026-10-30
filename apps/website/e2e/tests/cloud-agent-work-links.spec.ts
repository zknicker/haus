import { formatCloudAgentWorkLink } from '@haus/api';
import { seedCloudAgentWork, startCloudAgentWork } from '../support/agent-cloud-agent.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const credential = 'computer-cloud-agent-links-credential-1';
const slug = 'cloud-agent-links';
const launchTitle = 'Move the export worker';

// ADR 0044: Cloud Agent work is referenced, not embedded. Any Message that
// links the work shows the same live card, and the work outlives the Chat
// that asked for it.
test('linked Cloud Agent work reads as the same card wherever it is linked', async ({ page }) => {
    test.setTimeout(90_000);
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Cloud Agent Links',
        slug,
    });
    const seeded = await seedCloudAgentWork({
        agentHandle: 'orbit',
        channelName: 'all',
        computerCredential: credential,
        content: 'Delegating the first fix.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug,
        title: 'Fix the first thing',
        token: session.token,
    });
    const channel = (name: string) =>
        client.chat.createChannel.mutate({ agentIds: [seeded.agentId], name, serverId: server.id });
    const launch = await channel('launch');
    const techOps = await channel('tech-ops');
    const started = await startCloudAgentWork({
        agentId: seeded.agentId,
        chatId: launch.id,
        computerCredential: credential,
        content: 'Sending the export move to a Cloud Agent.',
        repository: 'haus/haus',
        target: '#launch',
        title: launchTitle,
    });

    // A human moves the conversation and links the running work there; a
    // made-up link to work nobody recorded stays words, with no card.
    const moved = await client.chat.send.mutate({
        chatId: techOps.id,
        content: `Tracking the move here.\n\n${formatCloudAgentWorkLink(launchTitle, started.work.id)}`,
        nonce: 'link-move',
        serverId: server.id,
    });
    const forgedLink = await client.chat.send.mutate({
        chatId: techOps.id,
        content: `Not real.\n\n${formatCloudAgentWorkLink('Forged job', 'caw_forged')}`,
        nonce: 'link-forged',
        serverId: server.id,
    });

    await page.goto(`/s/${slug}`);
    await openChannel(page, 'tech-ops');
    // Locate rows by id: back-to-back Messages share a grouping wrapper that
    // also carries data-message-id and contains both texts.
    const linking = page.locator(`[data-message-id="${moved.message.id}"]`);
    const card = linking.getByTestId('cloud-agent-work-card');
    await expect(card).toContainText(launchTitle);
    // No Run has reported yet, so the queued launch reads as its stage.
    await expect(card).toContainText('Starting');
    // The card states the work, so the closing link paragraph is not repeated.
    await expect(linking.getByText(launchTitle, { exact: true })).toHaveCount(1);
    // Every link carries the same actions as the launch Message's card.
    await expect(card.getByRole('button', { name: 'Open in Cursor' })).toBeVisible();
    const forged = page.locator(`[data-message-id="${forgedLink.message.id}"]`);
    await expect(forged).toContainText('Forged job');
    await expect(forged.getByTestId('cloud-agent-work-card')).toHaveCount(0);

    // Deleting the Chat that asked for the work keeps the work: Happening now
    // still lists it, and opening it goes to the Message that links it.
    await client.chat.deleteChannel.mutate({
        chatId: launch.id,
        confirmation: 'launch',
        serverId: server.id,
    });
    await page.goto(`/s/${slug}/inbox`);
    const row = page.getByRole('button', { name: new RegExp(launchTitle, 'u') });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/chats/${techOps.id}`, 'u'));
    await expect(card).toContainText(launchTitle);
});
