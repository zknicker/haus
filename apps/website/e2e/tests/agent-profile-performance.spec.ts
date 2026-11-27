import { createTestCaptain } from '../support/captains.ts';
import { attachComputer, captainTile, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a cold Captain panel keeps identity and navigation available before its content arrives', async ({
    page,
}) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route(
        '**/src/features/members/agent-profile/agent-profile-content.tsx*',
        async (route) => {
            await held;
            await route.continue();
        }
    );
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Agent performance',
        slug: 'agent-performance',
    });
    const computer = await attachComputer(client, {
        credential: 'agent-performance-computer-credential-1234',
        slug: server.slug,
    });
    await createTestCaptain(client, {
        computerId: computer.computerId,
        databaseUrl: session.databaseUrl,
        displayName: 'Iris',
        handle: 'iris',
        serverId: server.id,
    });
    await page.reload();
    const row = captainTile(page, 'Iris');
    await expect(row).toBeVisible();
    await page.route(
        (url) =>
            url.pathname.startsWith('/trpc/') &&
            url.pathname.slice('/trpc/'.length).split(',').includes('agent.get'),
        async (route) => {
            await held;
            await route.continue();
        }
    );
    const panel = page.getByRole('complementary', { name: 'Captain panel' });
    try {
        await row.click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'View Captain profile', exact: true }).click();
        await expect(panel.getByRole('heading', { level: 2, name: /^Iris/u })).toBeVisible();
        await panel
            .getByRole('grid', { name: 'Setup' })
            .getByRole('row', { name: 'All settings', exact: true })
            .click();
        await panel
            .getByRole('grid', { name: 'All settings' })
            .getByRole('row', { name: 'Automations', exact: true })
            .click();
        await expect(panel.getByRole('heading', { level: 2, name: 'Automations' })).toBeVisible();
        await expect(panel.getByRole('button', { name: 'Back to All settings' })).toBeVisible();
        await expect(page.locator('.skeleton')).toHaveCount(0);
    } finally {
        release();
    }
    await expect(page.getByRole('button', { name: 'New Trigger', exact: true })).toBeVisible();
});
