import { attachComputer, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a cold Agent profile keeps identity and navigation available before its content arrives', async ({
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
    runPsql(
        session.databaseUrl,
        `insert into agents (
        id, server_id, computer_id, handle, display_name, home_timezone,
        desired_runtime_id, desired_model_id, created_at
    ) values ('agt_performance', '${server.id}', '${computer.computerId}',
        'iris', 'Iris', 'America/New_York', 'codex', 'gpt-5.6-sol', now())`
    );
    await page.reload();
    const row = page.getByRole('row', { name: 'Iris', exact: true });
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
    try {
        await row.click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'View agent profile', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Iris', exact: true })).toBeVisible();
        await page.getByRole('button', { name: /^Automations/u }).click();
        await expect(page.getByRole('list', { name: 'Breadcrumbs' })).toContainText('Automations');
        await expect(page.locator('.skeleton')).toHaveCount(0);
    } finally {
        release();
    }
    await expect(page.getByRole('button', { name: 'New Trigger', exact: true })).toBeVisible();
});
