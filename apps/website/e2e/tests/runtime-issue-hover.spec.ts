import { agentCommandSchema, usageOverviewSchema } from '@haus/api';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { attachComputer, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('runtime sign-in help stays open while hovering and copying the command', async ({
    page,
    context,
}) => {
    test.setTimeout(60_000);
    const slug = 'runtime-help-hq';
    const { client } = await createTestServer(page, { displayName: 'Runtime Help HQ', slug });
    const credential = 'runtime-help-computer-credential-1234';
    await attachComputer(client, { credential, slug });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    try {
        await socketOpen(computer);
        const accepted = socketMessage(computer);
        sendBootstrap(computer, credential, 'complete');
        await accepted;
        computer.addEventListener('message', (event) => {
            const command = agentCommandSchema.safeParse(JSON.parse(String(event.data)));
            if (!command.success) {
                return;
            }
            if (
                command.data.type === 'browser-request' ||
                command.data.type === 'cloud-agent-capability-request'
            ) {
                computer.send(
                    JSON.stringify({
                        requestId: command.data.requestId,
                        type:
                            command.data.type === 'browser-request'
                                ? 'browser-result'
                                : 'cloud-agent-capability-result',
                        error: 'Not configured in this fixture.',
                    })
                );
            }
        });
        computer.send(
            JSON.stringify({
                type: 'report',
                inventory: {
                    name: 'Help Computer',
                    runtimes: [{ id: 'claude-code', label: 'Claude Code', models: [] }],
                    runtimeIssues: [
                        {
                            runtimeId: 'claude-code',
                            kind: 'authentication',
                            observedAt: new Date().toISOString(),
                        },
                    ],
                },
            })
        );
        const unavailable = { code: 'auth', message: 'Sign in required', name: 'UsageError' };
        computer.send(
            JSON.stringify({
                type: 'usage-report',
                usage: usageOverviewSchema.parse({
                    capturedAt: new Date().toISOString(),
                    claude: { provider: 'claude', status: 'error', error: unavailable },
                    codex: { provider: 'codex', status: 'error', error: unavailable },
                    grok: { provider: 'grok', status: 'error', error: unavailable },
                    connectedProviders: ['claude-code'],
                    openRouter: {
                        status: 'ok',
                        error: null,
                        overview: {
                            days: 0,
                            keys: [],
                            message: null,
                            note: null,
                            series: [],
                            status: 'unconfigured',
                            totalByokUsageUsd: 0,
                            totalRequests: 0,
                            totalUsageUsd: 0,
                        },
                    },
                    runtimeUsage: [],
                }),
            })
        );
        await page.goto(`/s/${slug}/computers`);
        const trigger = page.getByRole('button', { name: 'Claude Code: authentication details' });
        await expect(trigger).toBeVisible({ timeout: 20_000 });
        const card = page.getByRole('dialog', { name: 'Claude Code help' });
        await expect(async () => {
            await page.mouse.move(0, 0);
            await trigger.hover();
            await expect(card).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 10_000 });
        await card.getByRole('heading').hover();
        // Stay beyond the close delay to catch a pending dismissal after leaving the trigger.
        await page.waitForTimeout(700);
        await expect(card).toBeVisible();
        const copy = card.getByRole('button', { name: 'Copy code' });
        await copy.hover();
        await page.waitForTimeout(1700);
        await expect(card).toBeVisible();
        await copy.click();
        await expect
            .poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toBe('claude auth login');
        await expect(card).toBeVisible();
        await page.mouse.move(0, 0);
        await expect(card).toBeHidden();
        await trigger.hover();
        await expect(card).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(card).toBeHidden();
    } finally {
        computer.close();
    }
});
