import {
    agentCommandSchema,
    computerInventoryRefreshRequestSchema,
    type UsageOverview,
} from '@haus/api';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { attachComputer, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('old provider usage stays labeled until a fresh Computer snapshot arrives', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const { client: owner } = await createTestServer(page, {
        displayName: 'Usage HQ',
        slug: 'usage-hq',
    });
    const credential = 'computer-usage-test-credential-1234';
    const { computerId } = await attachComputer(owner, { credential, slug: 'usage-hq' });
    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    try {
        await socketOpen(computer);
        const accepted = socketMessage(computer);
        sendBootstrap(computer, credential, 'complete');
        expect(await accepted).toMatchObject({ mode: 'ordinary' });
        computer.send(
            JSON.stringify({
                agents: [],
                inventory: {
                    name: 'Mac Computer',
                    runtimes: [{ id: 'claude-code', label: 'Claude Code', models: [] }],
                },
                type: 'report',
            })
        );
        computer.send(
            JSON.stringify({ type: 'usage-report', usage: planUsage('2026-08-19T04:08:16.193Z') })
        );
        await page.goto(`/s/usage-hq/settings/computers/${computerId}`);
        await expect(page.getByText('22% of the week left · out of date')).toBeVisible({
            timeout: 20_000,
        });
        computer.send(
            JSON.stringify({ type: 'usage-report', usage: planUsage(new Date().toISOString()) })
        );
        await expect(page.getByText(/% of the week left$/u)).toBeVisible();
        await expect(page.getByText(/out of date/u)).toHaveCount(0);
    } finally {
        computer.close();
    }
});

test('manual refresh updates the device plans without reloading', async ({ page }) => {
    const slug = 'runtime-refresh-hq';
    const { client: owner } = await createTestServer(page, {
        displayName: 'Runtime Refresh HQ',
        slug,
    });
    const credential = 'computer-runtime-refresh-credential-1234';
    const attachment = await attachComputer(owner, { credential, slug });
    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    try {
        await socketOpen(computer);
        const accepted = socketMessage(computer);
        sendBootstrap(computer, credential, 'complete');
        expect(await accepted).toMatchObject({ mode: 'ordinary' });
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
        const codex = {
            id: 'codex',
            label: 'Codex',
            models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
        };
        computer.send(
            JSON.stringify({
                type: 'report',
                inventory: { name: 'Refresh Computer', runtimes: [codex] },
            })
        );
        computer.send(
            JSON.stringify({ type: 'usage-report', usage: planUsage(new Date().toISOString()) })
        );
        await page.goto(`/s/${slug}/settings/computers/${attachment.computerId}`);
        const workers = page.locator('section', {
            has: page.getByRole('heading', { exact: true, name: 'Workers' }),
        });
        await expect(workers).toContainText('Codex');
        await expect(workers).not.toContainText('Grok Build');
        const refreshRequest = new Promise<
            ReturnType<typeof computerInventoryRefreshRequestSchema.parse>
        >((resolve) => {
            computer.addEventListener('message', (event) => {
                const parsed = computerInventoryRefreshRequestSchema.safeParse(
                    JSON.parse(String(event.data))
                );
                if (parsed.success) {
                    resolve(parsed.data);
                }
            });
        });
        const refresh = page.getByRole('button', { exact: true, name: 'Refresh' });
        await refresh.click();
        const request = await refreshRequest;
        // The control is an icon now: it says it is working by going pending
        // (a spinner in place of the glyph) rather than by changing its label.
        await expect(refresh).toHaveAttribute('data-pending', 'true');
        const grok = {
            id: 'grok-build',
            label: 'Grok Build',
            models: [{ id: 'grok-4.6', label: 'Grok 4.6' }],
        };
        computer.send(
            JSON.stringify({
                ...request,
                type: 'inventory-refresh-result',
                status: 'refreshed',
                runtimes: [codex, grok],
            })
        );
        await expect(page.getByText('Refreshed', { exact: true })).toBeVisible();
        // Grok Build is not a Worker runtime (ADR 0057), so Workers never lists it.
        await expect(workers.getByText('Grok Build')).toHaveCount(0);
        await expect(page.getByText(/Not detected/u)).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath('refreshed-plans.png') });
    } finally {
        computer.close();
    }
});

function planUsage(capturedAt: string): UsageOverview {
    const unavailable = { code: 'request' as const, message: 'Unavailable', name: 'UsageError' };
    return {
        capturedAt: new Date().toISOString(),
        claude: {
            provider: 'claude',
            status: 'ok',
            snapshot: {
                capturedAt,
                extraUsage: null,
                provider: 'claude',
                source: 'anthropic-oauth-usage',
                subscriptionType: 'max',
                windows: [
                    {
                        id: 'current-week-all-models',
                        label: 'Weekly Limit',
                        remainingPercent: 78,
                        resetsAt: new Date(Date.parse(capturedAt) + 7 * 86_400_000).toISOString(),
                        usedPercent: 22,
                    },
                ],
            },
        },
        codex: { provider: 'codex', status: 'error', error: unavailable },
        connectedProviders: ['claude-code'],
        grok: { provider: 'grok', status: 'error', error: unavailable },
        openRouter: {
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
            status: 'ok',
        },
    };
}
