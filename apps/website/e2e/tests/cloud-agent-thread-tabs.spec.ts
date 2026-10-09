import { seedCloudAgentWork } from '../support/agent-cloud-agent.ts';
import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('desktop Cloud Agent work opens as a Thread page with working actions', async ({ page }) => {
    await installDesktopBrowserStub(page);
    const { server, session } = await createTestServer(page, {
        displayName: 'Cloud Agent Tabs',
        slug: 'cloud-agent-tabs',
    });
    const title = 'Fix the migration in Cursor';
    await seedCloudAgentWork({
        agentHandle: 'orbit',
        channelName: 'all',
        computerCredential: 'computer-cloud-agent-tabs-credential',
        content: 'Delegating the migration fix to Cursor.',
        databaseUrl: session.databaseUrl,
        repository: 'haus/haus',
        serverId: server.id,
        slug: 'cloud-agent-tabs',
        startingRef: 'main',
        title,
        token: session.token,
    });

    await page.goto('/s/cloud-agent-tabs');
    await openChannel(page, 'all');
    // Before any reply the Message's own hover action is the way into its Thread.
    const anchorRow = page
        .getByTestId('cloud-agent-work-card')
        .locator('xpath=ancestor::*[@data-slot="chat-message-assistant"][1]');
    await anchorRow.hover();
    await anchorRow.locator('button[aria-label="Reply in thread"]').click();
    // With one pane, the Thread page replaces the chat in the same tab.
    const card = page.getByTestId('thread-conversation').getByTestId('cloud-agent-work-card');
    await expect(card).toContainText(title);
    await expect(card).toContainText('Working');
    await card.getByRole('button', { name: /more Cloud Agent actions/u }).click();
    await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeEnabled();
    await page.getByRole('menuitem', { name: 'Cancel run' }).click();
    await expect(card.getByTestId('cloud-agent-work-status-line')).toContainText('Stopping');
    await expect(page.getByText('Unexpected Application Error!')).toHaveCount(0);
});
