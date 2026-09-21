import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { WebSocket } from 'ws';
import { attachComputer, createTestServer, runAgentAction } from '../support/server.ts';
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
    const { client: owner } = await createTestServer(page, {
        displayName: 'Agent HQ',
        slug: 'agent-hq',
    });
    const attachment = await attachComputer(owner, {
        credential: computerCredential,
        slug: 'agent-hq',
    });

    // The Computer reports its sanitized inventory over its attachment socket.
    await reportInventory();

    await page.goto('/s/agent-hq/members');
    await page.getByRole('button', { name: 'Create Agent' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create Agent' });
    await expect(createDialog.getByLabel('Runtime')).toContainText('Codex');
    await expect(createDialog.getByLabel('Model')).toContainText('GPT-5.6 Sol');
    await createDialog.getByRole('textbox', { name: 'Name' }).fill('Scout');
    await createDialog.getByRole('button', { name: 'Create Agent' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Scout' })).toBeVisible();
    // A new Agent lands on its own page outside Settings, on the Overview tab.
    await expect(page).toHaveURL(/\/s\/agent-hq\/agents\/[^/]+\/overview$/u);

    // The current hosted profile owns the same lifecycle and configuration
    // contracts the retired local profile exposed.
    for (const section of ['Overview', 'Setup', 'Automations', 'Activity', 'Workspace']) {
        await expect(page.getByRole('radio', { name: section })).toBeVisible();
    }

    // Every lifecycle verb is a menu item on the header now. Stop is the one
    // that needs something to stop, so it is inert on an idle Agent.
    await page.getByRole('button', { name: 'Scout — Agent actions' }).click();
    await expect(page.getByRole('menuitem', { exact: true, name: 'Stop' })).toBeDisabled();
    await expect(
        page.getByRole('menuitem', { exact: true, name: 'Start fresh session' })
    ).toBeEnabled();
    await page.getByRole('menuitem', { exact: true, name: 'Restart' }).click();

    await runAgentAction(page, 'Scout', 'Full reset');
    const resetConfirmation = page.getByRole('alertdialog', { name: 'Full Reset?' });
    await expect(resetConfirmation).toContainText('MEMORY.md');
    await expect(resetConfirmation).toContainText('kept');
    await resetConfirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(resetConfirmation).toBeHidden();

    // Execution configuration is a Setup fact, and Setup owns its Edit dialog.
    await page.getByRole('radio', { name: 'Setup' }).click();
    await expect(page).toHaveURL(/\/agents\/[^/]+\/setup$/u);
    await expect(page.getByText('Applies when Computer reconnects')).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const runtimeDialog = page.getByRole('dialog', { name: 'Runtime Config' });
    await expect(runtimeDialog.getByLabel('Reasoning effort')).toContainText('Medium');
    await runtimeDialog.getByLabel('Model').click();
    await page.getByRole('option', { name: 'GPT-5.6 Terra' }).click();
    await runtimeDialog.getByLabel('Reasoning effort').click();
    await page.getByRole('option', { name: 'Max', exact: true }).click();
    await runtimeDialog.getByRole('button', { name: 'Save' }).click();
    await expect(runtimeDialog).toBeHidden();
    await expect(page.getByText('GPT-5.6 Terra', { exact: true })).toBeVisible();
    await expect(page.getByText('Max', { exact: true })).toBeVisible();
    // The tab is in the URL, so a reload comes back to Setup rather than Overview.
    await page.reload();
    await expect(page.getByText('GPT-5.6 Terra', { exact: true })).toBeVisible();
    await expect(page.getByText('Max', { exact: true })).toBeVisible();

    // Deletion requires the exact Agent name. Cancel leaves this isolated
    // e2e Agent intact for the adjacent DM and contract assertions.
    await runAgentAction(page, 'Scout', 'Delete Agent');
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toContainText('permanently destroys');
    const deleteButton = confirmation.getByRole('button', { name: 'Delete Agent' });
    const nameField = confirmation.getByLabel(/Type Scout to confirm/iu);
    await expect(deleteButton).toBeDisabled();
    await nameField.fill('cove');
    await expect(deleteButton).toBeDisabled();
    await nameField.fill('Scout');
    await expect(deleteButton).toBeEnabled();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toBeHidden();

    // The DM appears as an ordinary Agent DM, not a special onboarding Channel.
    await page.goto('/s/agent-hq');
    await expect(page.getByRole('row', { name: 'Scout' })).toBeVisible();

    // Cross-Computer / unreported references fail closed at the contract.
    const [computer] = await owner.computer.list.query({ serverId: attachment.serverId });
    await expect(
        owner.agent.create.mutate({
            computerId: computer.id,
            displayName: 'Ghost',
            handle: 'ghost',
            modelId: 'gpt-9-unreported',
            runtimeId: 'codex',
            serverId: attachment.serverId,
        })
    ).rejects.toThrow(/does not report the model/iu);
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
