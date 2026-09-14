import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { attachComputer, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a populated Computer page never presents its attach flow while inventory loads', async ({
    page,
}) => {
    const { client: owner } = await createTestServer(page, {
        displayName: 'Loading Computer HQ',
        slug: 'loading-computer-hq',
    });
    await attachComputer(owner, {
        credential: 'computer-loading-test-credential-1234',
        slug: 'loading-computer-hq',
    });
    // Matches the batched form too: httpBatchLink joins concurrent procedures
    // into one `/trpc/a,b?batch=1` request, so the single-procedure path alone
    // would never intercept — and the skeletons would resolve unobserved.
    await page.route('**/trpc/*computer.list*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
    });

    await page.goto('/s/loading-computer-hq/computers');

    // The settings sidebar and the lazily-chunked section mount at different
    // moments, so their two skeletons no longer overlap reliably — what
    // matters is that a skeleton shows and the attach flow never flashes.
    await expect(page.getByText('Loading Computers').first()).toBeVisible();
    await expect(page.getByText('Attach a Computer')).toHaveCount(0);
    await expect(page.getByText('Computers · 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Attach a Computer')).toHaveCount(0);
});

test('an Owner updates one Computer from Settings through isolated progress', async ({ page }) => {
    test.setTimeout(60_000);
    const { client: owner } = await createTestServer(page, {
        displayName: 'Computer HQ',
        slug: 'computer-hq',
    });
    const credential = 'computer-test-credential-1234567890';
    await attachComputer(owner, {
        credential,
        slug: 'computer-hq',
    });

    await page.goto('/s/computer-hq/computers');
    await expect(page.getByText('Computers · 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Awaiting first report')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recovery Commands' })).toBeVisible();

    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(computer);
    const bootstrapAccepted = socketMessage(computer);
    sendBootstrap(computer, credential, 'idle');
    expect(await bootstrapAccepted).toMatchObject({
        mode: 'update-required',
        type: 'bootstrap-accepted',
    });

    await page.reload();
    const detail = page.getByRole('main', { name: 'Scrollable main content' });
    await expect(detail.getByText('v1.0.0', { exact: true })).toBeVisible();
    await expect(
        page.getByRole('gridcell', { name: /Update required Mac Computer/u })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('Update available')).toBeVisible();
    const updateButton = page.getByRole('button', { name: 'Update to v1.1.0' });
    await expect(updateButton).toBeEnabled();

    const updateCommand = socketMessage(computer);
    await updateButton.click();
    await expect(page.getByText('Download requested')).toBeVisible();
    expect(await updateCommand).toMatchObject({
        release: { release: { version: '1.1.0' } },
        type: 'update',
    });
    await reportProgress(computer, 'downloading', 'Downloading Haus Computer 1.1.0.', {
        downloaded: 5 * 1024 * 1024,
        total: 10 * 1024 * 1024,
    });
    await expect(page.getByText('Downloading Haus Computer', { exact: true })).toBeVisible();
    await expect(
        page.getByRole('progressbar', { name: 'Downloading Haus Computer' })
    ).toHaveAttribute('aria-valuenow', '50');
    await reportProgress(computer, 'verifying', 'Verifying signature and integrity.');
    await expect(
        page.getByText('Verifying signature and integrity', { exact: true })
    ).toBeVisible();
    await reportProgress(computer, 'installing', 'Installing signed release.');
    await expect(page.getByText('Installing update')).toBeVisible();
    await reportProgress(computer, 'waiting-for-agents', 'Waiting for active Agents.');
    await expect(page.getByText('Waiting for active Agents…')).toBeVisible();
    await reportProgress(computer, 'restarting', 'Restarting Computer.');
    await expect(page.getByText('Restarting Haus Computer')).toBeVisible();
    computer.close();
    await page.reload();
    await expect(page.getByText('Restarting Haus Computer')).toBeVisible();

    const reconnectedComputer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(reconnectedComputer);
    const reconnected = socketMessage(reconnectedComputer);
    sendBootstrap(reconnectedComputer, credential, 'complete');
    expect(await reconnected).toMatchObject({ mode: 'ordinary' });
    await expect(page.getByRole('gridcell', { name: /Online Mac Computer v1.1.0/u })).toBeVisible();

    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByText('Haus Computer is up to date', { exact: true })).toBeVisible();
    await expect(page.getByText('Version 1.1.0 is the latest production release.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Update to/u })).toHaveCount(0);
    reconnectedComputer.close();
});

test('an Owner connects a Computer to Cursor Cloud Agents from Settings', async ({ page }) => {
    const { client: owner } = await createTestServer(page, {
        displayName: 'Cloud Agent HQ',
        slug: 'cloud-agent-hq',
    });
    const credential = 'computer-cloud-agent-credential-1234';
    await attachComputer(owner, { credential, slug: 'cloud-agent-hq' });

    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(computer);
    const accepted = socketMessage(computer);
    sendBootstrap(computer, credential, 'complete');
    expect(await accepted).toMatchObject({ mode: 'ordinary' });
    sendCloudAgentReport(computer, { ready: false, reason: 'not-connected' });
    answerCloudAgentCapability(computer);

    await page.goto('/s/cloud-agent-hq/computers');
    const detail = page.getByRole('main', { name: 'Scrollable main content' });
    await expect(detail.getByText('Cursor Cloud Agents')).toBeVisible();
    await expect(detail.getByText('Not connected')).toBeVisible();

    await detail.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByText('Cursor connected')).toBeVisible();
    await expect(detail.getByText('Ready')).toBeVisible();
    await expect(detail.getByText('delegate@example.com')).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Cursor Cloud Agents actions' })).toBeVisible();
    computer.close();
});

/**
 * The Computer's own inventory line. It renders the capability row before the
 * settings read answers, so the row is truthful on first paint.
 */
function sendCloudAgentReport(
    socket: WebSocket,
    readiness: { ready: boolean; reason: string | null }
) {
    socket.send(
        JSON.stringify({
            agents: [],
            inventory: {
                cloudAgentProviders: [{ provider: 'cursor', ...readiness }],
                name: 'Mac Computer',
                runtimes: [],
            },
            type: 'report',
        })
    );
}

/**
 * Stands in for Cursor's browser sign-in, which runs on the Computer. It keeps
 * the credential state a real Computer keeps, so the read that follows a
 * connect answers connected, and it reports the new inventory line the way the
 * Computer does.
 */
function answerCloudAgentCapability(socket: WebSocket) {
    let connected = false;
    socket.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data)) as {
            operation?: { kind: string };
            requestId?: string;
            type?: string;
        };
        if (frame.type === 'browser-request') {
            // The page batches Browser and Cloud Agent reads; both need a reply.
            socket.send(
                JSON.stringify({
                    error: 'Browser is unavailable on this test Computer.',
                    requestId: frame.requestId,
                    type: 'browser-result',
                })
            );
            return;
        }
        if (frame.type !== 'cloud-agent-capability-request') {
            return;
        }
        if (frame.operation?.kind === 'connect' || frame.operation?.kind === 'disconnect') {
            connected = frame.operation.kind === 'connect';
        }
        socket.send(
            JSON.stringify({
                requestId: frame.requestId,
                result: {
                    accountEmail: connected ? 'delegate@example.com' : null,
                    expiresAt: null,
                    provider: 'cursor',
                    ready: connected,
                    reason: connected ? null : 'not-connected',
                },
                type: 'cloud-agent-capability-result',
            })
        );
        sendCloudAgentReport(
            socket,
            connected ? { ready: true, reason: null } : { ready: false, reason: 'not-connected' }
        );
    });
}

async function reportProgress(
    socket: WebSocket,
    phase:
        | 'complete'
        | 'downloading'
        | 'installing'
        | 'restarting'
        | 'verifying'
        | 'waiting-for-agents',
    detail: string,
    bytes?: { downloaded: number; total: number }
) {
    socket.send(
        JSON.stringify({
            type: 'update-progress',
            update: {
                activeAgentCount: phase === 'waiting-for-agents' ? 1 : null,
                detail,
                downloadedBytes: bytes?.downloaded ?? null,
                failedPhase: null,
                phase,
                targetVersion: '1.1.0',
                totalBytes: bytes?.total ?? null,
                updatedAt: new Date().toISOString(),
            },
        })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
}
