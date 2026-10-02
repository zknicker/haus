import { seedCloudAgentWork } from '../support/agent-cloud-agent.ts';
import { installDesktopBrowserStub } from '../support/desktop-browser-stub.ts';
import { createTestServer, openChannel } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('desktop Cloud Agent work opens in a Thread tab with working actions', async ({ page }) => {
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
    await page.getByRole('button', { name: /^Open thread, Cloud Agent work/u }).click();
    const pane = page.getByRole('complementary', { name: 'Side pane' });
    const card = pane.getByTestId('cloud-agent-work-card');
    await expect(card).toContainText(title);
    await expect(card).toContainText('Queued');
    await card.getByRole('button', { name: /more Cloud Agent actions/u }).click();
    await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeEnabled();
    await page.getByRole('menuitem', { name: 'Cancel run' }).click();
    await expect(card).toContainText('Cancelling');
    await page.getByRole('button', { name: 'Open as tabs', exact: true }).click();
    await expect(page.getByTestId('cloud-agent-work-card')).toContainText('Cancelling');
    await expect(page.getByText('Unexpected Application Error!')).toHaveCount(0);
});
