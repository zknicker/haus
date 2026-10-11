import { attachComputer, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

// The GitHub App is not registered in tests, so the bound installation is
// seeded the way binding leaves it: a signed-in GitHub connection, an active
// installation with a fresh access cache, and the Agent's grant on the
// connection. Creating a Trigger scoped to every accessible repository needs
// no GitHub call, so the create below runs the real Server path.
test('an Owner wires a GitHub Trigger and sees its installation and problem', async ({
    page,
}, testInfo) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'GitHub Triggers',
        slug: 'github-triggers',
    });
    const computer = await attachComputer(client, {
        credential: 'github-trigger-test-credential-1234567890',
        slug: 'github-triggers',
    });
    seedGithubState({
        computerId: computer.computerId,
        databaseUrl: session.databaseUrl,
        serverId: server.id,
    });

    // The connection page lists the installation with its repository reach.
    await page.goto(`/s/github-triggers/settings/connections/${connectionId}?github_setup=bound`);
    await expect(page.getByText('Installation added', { exact: true })).toBeVisible();
    await expect(page.getByText('acme-labs', { exact: true })).toBeVisible();
    await expect(page.getByText('All repositories', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install on GitHub' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('github-installations.png') });
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText('Installation added', { exact: true })).toHaveCount(0);

    await page.goto(`/s/github-triggers/agents/${agentId}/automations`);
    await page.getByRole('button', { name: 'New Trigger' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('textbox', { name: 'Name' }).fill('CI failed on main');
    await sheet.getByRole('button', { name: /Trigger type/u }).click();
    await page.getByRole('option', { name: /GitHub/u }).click();
    // One active installation is chosen for the reader.
    await expect(sheet.getByRole('button', { name: /acme-labs/u })).toBeVisible();
    await sheet.getByRole('button', { name: /Events/u }).click();
    await page.getByRole('option', { name: 'Workflow runs' }).click();
    await page.keyboard.press('Escape');
    await sheet.getByRole('row', { exact: true, name: 'Failure' }).click();
    await sheet.getByRole('button', { name: 'Create' }).click();

    // Creating lands on the detail: no URL, no secret, what it listens to.
    await expect(sheet.getByRole('heading', { name: 'CI failed on main' })).toBeVisible();
    await expect(sheet.getByText('GitHub trigger', { exact: true })).toBeVisible();
    await expect(sheet.getByText('All accessible repositories', { exact: true })).toBeVisible();
    await expect(sheet.getByText('completed · failure', { exact: true })).toBeVisible();
    await expect(sheet.getByText('Rotate secret')).toHaveCount(0);
    await expect(sheet.getByText('URL', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    runPsql(
        session.databaseUrl,
        `update github_trigger_configs set problem = 'sign_in_required', problem_since = now()
         where server_id = '${server.id}'`
    );
    await page.reload();
    await expect(page.getByText('Sign in required', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /CI failed on main/u }).click();
    await expect(
        page.getByRole('dialog').getByText(/GitHub needs a fresh sign-in\./u)
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('github-trigger-problem.png') });
});

const agentId = 'agt_e2e_github';
const connectionId = 'mcp_e2eGithubConn001';

function seedGithubState(input: { computerId: string; databaseUrl: string; serverId: string }) {
    runPsql(
        input.databaseUrl,
        `begin;
         insert into agents (
           id, server_id, computer_id, handle, display_name, home_timezone,
           desired_runtime_id, desired_model_id
         ) values (
           '${agentId}', '${input.serverId}', '${input.computerId}', 'octo', 'Octo',
           'America/New_York', 'codex', 'gpt-5.6-sol'
         );
         insert into mcp_connections (
           id, server_id, name, url, auth, preset, connected, account_label, header_names, tools
         ) values (
           '${connectionId}', '${input.serverId}', 'GitHub', 'https://api.githubcopilot.com/mcp/',
           'oauth', 'github', true, 'octocat', '{}', '{}'
         );
         insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
         values ('${input.serverId}', '${agentId}', '${connectionId}');
         insert into github_installations (
           id, server_id, connection_id, installation_id, account_id, account_login, account_type,
           repository_selection, permissions, events, status, accessible_repository_ids,
           access_synced_at, created_at, updated_at, synced_at
         ) values (
           'ghi_e2eAcmeLabs00001', '${input.serverId}', '${connectionId}', 910001, 7001,
           'acme-labs', 'Organization', 'all',
           '{"actions":"write","checks":"read","contents":"write","deployments":"read","issues":"write","pull_requests":"write"}',
           '{workflow_run}', 'active', '{101,102}', now(), now(), now(), now()
         );
         commit;`
    );
}
