import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { WebSocket } from 'ws';
import { createHomedAgent } from '../support/project.ts';
import {
    attachComputer,
    captainTile,
    createTestServer,
    runAgentAction,
} from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const computerCredential = 'agent-e2e-credential-0000000000000000';
const inventory = {
    runtimes: [
        {
            id: 'codex',
            label: 'Codex',
            models: [
                { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
                {
                    id: 'gpt-5.6-terra',
                    label: 'GPT-5.6 Terra',
                    defaultReasoningEffort: 'medium',
                    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
                },
            ],
        },
    ],
};

test('creates an ordinary Agent after inventory is reported and fails closed on unreported config', async ({
    page,
}) => {
    const { client: owner, server } = await createTestServer(page, {
        displayName: 'Agent HQ',
        slug: 'agent-hq',
    });
    await owner.project.create.mutate({ name: 'product', serverId: server.id });
    const attachment = await attachComputer(owner, {
        credential: computerCredential,
        slug: 'agent-hq',
    });

    // The Computer reports its sanitized inventory over its attachment socket.
    await reportInventory();

    await page.goto('/s/agent-hq');
    await page.getByLabel('New Captain').click();
    const createDialog = page.getByRole('dialog', { name: 'Create Captain' });
    await expect(createDialog.getByLabel('Runtime')).toContainText('Codex');
    await expect(createDialog.getByLabel('Model')).toContainText('GPT-5.6 Sol');
    await createDialog.getByRole('textbox', { name: 'Name' }).fill('Scout');
    await createDialog.getByRole('group').filter({ hasText: 'Select a project' }).click();
    await page.getByRole('option', { name: /product/u }).click();
    // The signature emoji is optional at creation and starts on the 👀 default.
    await createDialog.getByRole('button', { name: '👀 Signature emoji' }).click();
    await page.getByRole('option', { name: '🎉', exact: true }).click();
    await createDialog.getByRole('button', { name: 'Create Captain' }).click();

    // A Captain made from the sidebar opens its DM; its profile is its own page.
    await expect(page).toHaveURL(/\/s\/agent-hq\/dm\/[^/]+$/u);
    const agentId = new URL(page.url()).pathname.split('/').at(-1);
    await page.goto(`/s/agent-hq/agents/${agentId}/home`);
    await expect(page.getByRole('heading', { level: 1, name: 'Scout' })).toBeVisible();

    // The hub opens every section through a card, not titlebar tabs.
    for (const section of [
        'Runs on',
        'Profile',
        'Automations',
        'Skills',
        'Connections',
        'Workspace',
    ]) {
        await expect(
            page
                .getByLabel('Scrollable main content')
                .getByRole('button', { name: new RegExp(`^${section}`, 'u') })
        ).toBeVisible();
    }
    await expect(page.getByRole('radio', { name: 'Overview' })).toHaveCount(0);

    // The one profile editor carries the private conversation style and signature emoji beside
    // the role line, and the description's 280-character budget blocks Save rather than truncating.
    await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Captain profile' });
    const description = editor.getByRole('textbox', { name: 'Description', exact: true });
    await description.fill('x'.repeat(281));
    await expect(editor.getByText('Keep it to 280 characters.')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Save' })).toBeDisabled();
    await description.fill('Scouts competitor launches and pricing moves.');
    await editor
        .getByRole('textbox', { name: 'Conversation style', exact: true })
        .fill('Dry and deadpan.');
    // The emoji chosen at creation is already stored, so Reset is offered.
    await expect(editor.getByRole('button', { name: 'Reset' })).toBeVisible();
    await editor.getByRole('button', { name: '🎉 Signature emoji' }).click();
    await page.getByRole('option', { name: '🔥', exact: true }).click();
    await expect(editor.getByRole('button', { name: '🔥 Signature emoji' })).toBeVisible();
    await editor.getByRole('button', { name: 'Save' }).click();
    await expect(editor).toBeHidden();
    await page.reload();
    await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
    const reopened = page.getByRole('dialog', { name: 'Captain profile' });
    await expect(
        reopened.getByRole('textbox', { name: 'Conversation style', exact: true })
    ).toHaveValue('Dry and deadpan.');
    await expect(reopened.getByRole('button', { name: '🔥 Signature emoji' })).toBeVisible();
    await expect(reopened.getByRole('button', { name: 'Reset' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Every lifecycle verb is a menu item on the header now. Stop is the one
    // that needs something to stop, so it is inert on an idle Agent.
    await page.getByRole('button', { name: 'Scout — Captain actions' }).click();
    await expect(page.getByRole('menuitem', { exact: true, name: 'Stop' })).toBeDisabled();
    await expect(
        page.getByRole('menuitem', { exact: true, name: 'Start fresh session' })
    ).toBeEnabled();
    await page.getByRole('menuitem', { exact: true, name: 'Restart' }).click();

    await runAgentAction(page, 'Scout', 'Full reset');
    const resetConfirmation = page.getByRole('alertdialog', { name: 'Full Reset?' });
    await expect(resetConfirmation).toContainText('MEMORY.md');
    await expect(resetConfirmation).toContainText('Recently deleted');
    await resetConfirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(resetConfirmation).toBeHidden();

    // Execution configuration lives behind Runs on, which owns its Edit dialog.
    await page.getByRole('button', { name: /^Runs on/u }).click();
    await expect(page).toHaveURL(/\/agents\/[^/]+\/runtime$/u);
    await expect(
        page
            .getByRole('navigation', { name: 'Breadcrumb' })
            .getByRole('link', { exact: true, name: 'Scout' })
    ).toBeVisible();
    await expect(page.getByText('Applies when device reconnects')).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    // The runner's catalog is the only model list. Saving needs the provider's login in
    // Settings → Models, which this lane never holds, so every model points there instead.
    const modelDialog = page.getByRole('dialog', { name: 'Model' });
    await expect(modelDialog.getByRole('group', { name: 'Reasoning' })).toContainText('Medium');
    await modelDialog.getByRole('group').filter({ hasText: 'GPT-5.6 Sol' }).click();
    const terra = page.getByRole('option', { name: /GPT-5\.6 Terra/u });
    await expect(terra).toContainText('Connect in Settings → Models');
    await expect(terra).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(modelDialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await modelDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Model' })).toBeHidden();

    // Deletion requires the exact Agent name. Cancel leaves this isolated
    // e2e Agent intact for the adjacent DM and contract assertions.
    await runAgentAction(page, 'Scout', 'Delete Captain');
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toContainText('permanently destroys');
    const deleteButton = confirmation.getByRole('button', { name: 'Delete Captain' });
    const nameField = confirmation.getByLabel(/Type Scout to confirm/iu);
    await expect(deleteButton).toBeDisabled();
    await nameField.fill('cove');
    await expect(deleteButton).toBeDisabled();
    await nameField.fill('Scout');
    await expect(deleteButton).toBeEnabled();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toBeHidden();

    // The Captain appears as a sidebar tile.
    await page.goto('/s/agent-hq');
    await expect(captainTile(page, 'Scout')).toBeVisible();

    // Cross-Computer / unreported references fail closed at the contract.
    const [computer] = await owner.computer.list.query({ serverId: attachment.serverId });
    await expect(
        createHomedAgent(owner, {
            computerId: computer.id,
            displayName: 'Ghost',
            handle: 'ghost',
            modelId: 'gpt-9-unreported',
            runtimeId: 'codex',
            serverId: attachment.serverId,
        })
    ).rejects.toThrow(/does not offer the model/iu);
});

function reportInventory() {
    return new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(
            `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
        );
        socket.on('error', reject);
        socket.on('close', (code, reason) => {
            if (code !== 1005) {
                reject(new Error(`Attachment socket closed ${code}: ${reason.toString()}`));
            }
        });
        socket.on('message', (raw) => {
            if (JSON.parse(raw.toString()).type === 'bootstrap-accepted') {
                socket.send(JSON.stringify({ agents: [], inventory, type: 'report' }));
                socket.close();
                resolve();
            }
        });
        socket.on('open', () => {
            socket.send(
                JSON.stringify({
                    architecture: 'arm64',
                    bootstrapProtocolVersion: computerBootstrapProtocolVersion,
                    credential: computerCredential,
                    health: 'healthy',
                    operatingSystem: 'darwin',
                    productVersion: '1.1.5',
                    protocolVersion: computerProtocolVersion,
                    type: 'bootstrap',
                    update: {
                        detail: null,
                        phase: 'idle',
                        targetVersion: null,
                        updatedAt: new Date().toISOString(),
                    },
                })
            );
        });
    });
}
