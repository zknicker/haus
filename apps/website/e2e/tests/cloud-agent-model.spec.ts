import type { CloudAgentModel } from '@haus/api';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { attachComputer, createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const slug = 'cloud-agent-model';
const credential = 'computer-cloud-agent-model-credential';
const composer: CloudAgentModel = {
    description: 'Fast agentic coding',
    displayName: 'Composer 2',
    effort: null,
    family: 'composer',
    fast: null,
    id: 'composer-2',
    order: 0,
};
const gpt: CloudAgentModel = {
    description: null,
    displayName: 'GPT-5.6',
    effort: null,
    family: 'gpt',
    fast: null,
    id: 'gpt-5.6',
    order: 1,
};
const opus: CloudAgentModel = {
    description: null,
    displayName: 'Claude Opus 5.5',
    effort: {
        defaultValue: 'medium',
        options: [
            { displayName: 'Low', value: 'low' },
            { displayName: 'Medium', value: 'medium' },
            { displayName: 'High', value: 'high' },
        ],
        providerParamId: 'effort',
    },
    family: 'claude',
    fast: { defaultValue: false },
    id: 'claude-opus-5-5',
    order: 2,
};

test('an Owner picks the Cloud Agent model and its params, and a member reads them', async ({
    page,
}) => {
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
    const savedModel = async () =>
        (await client.cloudAgentSettings.get.query({ serverId: server.id })).model;

    await page.goto(`/s/${slug}/settings/models`);
    const group = page.getByRole('main', { name: 'Scrollable main content' });
    // The Autocomplete's labelled button is visually hidden; its group is the trigger.
    const pickerButton = group.getByRole('button', { name: /^(?!About ).*Cloud Agent model$/u });
    const picker = pickerButton.locator('xpath=..');
    const effort = group.getByRole('button', { name: /Cloud Agent effort$/u });
    const fast = group.getByRole('switch', { name: 'Cloud Agent fast mode' });

    // No Computer has reported a catalog yet: Auto is all there is.
    await expect(picker).toContainText('Auto');
    await expect(pickerButton).toBeDisabled();
    await expect(effort).toHaveCount(0);

    // A Computer report carrying a catalog refreshes the row without a reload.
    sendCatalog(computer, [composer, gpt, opus]);
    await expect(pickerButton).toBeEnabled();
    // Catalog freshness is the Model row's tooltip, not a row description.
    await group.getByRole('button', { name: 'About Model' }).focus();
    await expect(page.getByRole('tooltip')).toContainText('Model list updated just now.');
    await page.keyboard.press('Escape');
    await picker.click();
    const listbox = page.getByRole('listbox');
    // Family sections in product order, whatever Cursor's order across families.
    await expect(listbox.getByRole('option')).toHaveText([
        /Auto\s*Cursor picks a model for each run\./u,
        'Claude Opus 5.5',
        'GPT-5.6',
        /Composer 2\s*Fast agentic coding/u,
    ]);
    // Search matches the Cursor id as well as the name.
    await page.getByRole('searchbox', { name: 'Search Cloud Agent models' }).fill('claude-opus');
    await expect(listbox.getByRole('option')).toHaveText(['Claude Opus 5.5']);
    await listbox.getByRole('option', { name: 'Claude Opus 5.5' }).click();
    await expect(picker).toContainText('Claude Opus 5.5');
    await expect.poll(savedModel).toEqual({ id: 'claude-opus-5-5', kind: 'model', params: {} });

    // The model's own defaults show until a param is chosen; each choice saves at once.
    await expect(effort).toContainText('Medium');
    await expect(fast).not.toBeChecked();
    // Model, Effort, and Fast rows share one height whatever their control.
    const rowHeights = await page
        .locator('.item-card-group', { has: page.getByRole('heading', { name: 'Cloud Agents' }) })
        .locator('.item-card')
        .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(rowHeights).toHaveLength(3);
    expect(new Set(rowHeights).size).toBe(1);
    await effort.click();
    await page.getByRole('option', { name: 'High' }).click();
    await expect
        .poll(savedModel)
        .toEqual({ id: 'claude-opus-5-5', kind: 'model', params: { effort: 'high' } });
    await fast.click({ force: true });
    await expect.poll(savedModel).toEqual({
        id: 'claude-opus-5-5',
        kind: 'model',
        params: { effort: 'high', fast: true },
    });
    await page.reload();
    await expect(effort).toContainText('High');
    await expect(fast).toBeChecked();

    // A new model starts at its own defaults; one without params shows neither row.
    await picker.click();
    await page.getByRole('option', { name: /Composer 2/u }).click();
    await expect.poll(savedModel).toEqual({ id: 'composer-2', kind: 'model', params: {} });
    await expect(effort).toHaveCount(0);
    await expect(fast).toHaveCount(0);

    // Cursor stops listing the saved model: it reads as unavailable, and runs use Auto.
    sendCatalog(computer, [gpt, opus]);
    const warning = group.getByText(
        'Unavailable. Runs use Auto until you pick an available model.'
    );
    await expect(warning).toBeVisible();
    await expect(picker).toContainText('composer-2');

    // Picking the earlier model again does not bring its old params back.
    await picker.click();
    await page.getByRole('option', { name: 'Claude Opus 5.5' }).click();
    await expect(warning).toHaveCount(0);
    await expect(effort).toContainText('Medium');
    await expect(fast).not.toBeChecked();
    await expect.poll(savedModel).toEqual({ id: 'claude-opus-5-5', kind: 'model', params: {} });

    // A member who is not an Owner or Admin sees facts, not controls.
    await client.cloudAgentSettings.setModel.mutate({
        model: { id: 'claude-opus-5-5', kind: 'model', params: { effort: 'low', fast: true } },
        serverId: server.id,
    });
    runPsql(
        session.databaseUrl,
        `update server_memberships set role = 'member'
         where server_id = '${server.id}'
           and user_id = (select id from users where clerk_user_id = 'user_e2e_human')`
    );
    await page.reload();
    await expect(group.getByText('Claude Opus 5.5', { exact: true })).toBeVisible();
    await expect(group.getByText('Low', { exact: true })).toBeVisible();
    await expect(group.getByText('On', { exact: true })).toBeVisible();
    await expect(pickerButton).toHaveCount(0);
    await expect(effort).toHaveCount(0);
    await expect(fast).toHaveCount(0);
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
                        models: {
                            autoAvailable: true,
                            models,
                            refreshedAt: new Date().toISOString(),
                        },
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
