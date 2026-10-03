import type { CloudAgentModel } from '@haus/api';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { attachComputer, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'cloud-agent-model';
const credential = 'computer-cloud-agent-model-credential';
const composer: CloudAgentModel = {
    description: 'Fast agentic coding',
    displayName: 'Composer 2',
    id: 'composer-2',
};
const gpt: CloudAgentModel = { description: null, displayName: 'GPT-5.6', id: 'gpt-5.6' };

test('an Owner picks the Cloud Agent model, and a member reads it', async ({ page }) => {
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Cloud Agent Model',
        slug,
    });
    await attachComputer(client, { credential, slug });
    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(computer);
    const accepted = socketMessage(computer);
    sendBootstrap(computer, credential, 'complete');
    expect(await accepted).toMatchObject({ mode: 'ordinary' });

    await page.goto(`/s/${slug}/settings/models`);
    const group = page.getByRole('main', { name: 'Scrollable main content' });
    // The trigger's name leads with its value; the info button's leads with "About".
    const picker = group.getByRole('button', { name: /^(?!About ).*Cloud Agent model$/u });

    // No Computer has reported a catalog yet: Cursor default is all there is.
    await expect(picker).toContainText('Cursor default');
    await expect(picker).toBeDisabled();

    // A Computer report carrying a catalog refreshes the row without a reload.
    sendCatalog(computer, [composer, gpt]);
    await expect(picker).toBeEnabled();
    await expect(group.getByText(/^Updated /u)).toBeVisible();
    await picker.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox.getByRole('option')).toHaveText([
        'Cursor default',
        /Composer 2\s*Fast agentic coding/u,
        'GPT-5.6',
    ]);
    await listbox.getByRole('option', { name: /Composer 2/u }).click();
    await expect(picker).toContainText('Composer 2');
    await expect
        .poll(
            async () => (await client.cloudAgentSettings.get.query({ serverId: server.id })).model
        )
        .toEqual({ id: 'composer-2', kind: 'model' });
    await page.reload();
    await expect(picker).toContainText('Composer 2');

    // Cursor stops listing the saved model: it reads as unavailable, and runs use Cursor default.
    sendCatalog(computer, [gpt]);
    const warning = group.getByText(
        'Unavailable. Runs use Cursor default until you pick an available model.'
    );
    await expect(warning).toBeVisible();
    await expect(picker).toContainText('composer-2');

    // A member who is not an Owner or Admin sees the fact, not a picker.
    runPsql(
        session.databaseUrl,
        `update server_memberships set role = 'member'
         where server_id = '${server.id}'
           and user_id = (select id from users where clerk_user_id = 'user_e2e_human')`
    );
    await page.reload();
    await expect(warning).toBeVisible();
    await expect(group.getByText('composer-2', { exact: true })).toBeVisible();
    await expect(picker).toHaveCount(0);
    computer.close();
});

/** The Computer's inventory line with the catalog it read from Cursor. */
function sendCatalog(socket: WebSocket, models: CloudAgentModel[]) {
    socket.send(
        JSON.stringify({
            agents: [],
            inventory: {
                cloudAgentProviders: [
                    {
                        models: { models, refreshedAt: new Date().toISOString() },
                        provider: 'cursor',
                        ready: true,
                        reason: null,
                    },
                ],
                name: 'Mac Computer',
                runtimes: [],
            },
            type: 'report',
        })
    );
}
