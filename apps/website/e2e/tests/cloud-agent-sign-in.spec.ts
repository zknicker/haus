import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { attachComputer, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('an Owner connects a Computer to Cursor Cloud Agents from Settings', async ({
    page,
}, testInfo) => {
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
    const signIn = answerCloudAgentCapability(computer);

    await page.goto('/s/cloud-agent-hq/computers');
    const detail = page.getByRole('main', { name: 'Scrollable main content' });
    await expect(detail.getByText('Cursor Cloud Agents')).toBeVisible();
    await expect(detail.getByText('Not connected')).toBeVisible();

    await detail.getByRole('button', { name: 'Connect', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to Cursor', exact: true });
    await expect(dialog.getByText('Waiting for you to sign in')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Continue in Cursor' })).toBeEnabled();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('sign-in.png') });
    await dialog.getByRole('button', { name: 'Copy sign-in link' }).click();
    await expect(dialog.getByRole('button', { name: 'Link copied' })).toBeVisible();
    await page
        .context()
        .route('https://cursor.com/loginDeepControl?uuid=haus-e2e', (route) =>
            route.fulfill({ body: 'Cursor sign-in' })
        );
    const popupOpened = page.waitForEvent('popup');
    await dialog.getByRole('button', { name: 'Continue in Cursor' }).click();
    const popup = await popupOpened;
    await expect(popup).toHaveURL('https://cursor.com/loginDeepControl?uuid=haus-e2e');
    await popup.close();
    await dialog.getByRole('button', { name: 'Cancel sign-in' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(detail.getByText('Not connected')).toBeVisible();

    await detail.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(dialog.getByText('Waiting for you to sign in')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await detail.getByRole('button', { name: 'Continue sign-in' }).click();
    await expect(dialog.getByText('Waiting for you to sign in')).toBeVisible();
    signIn.expire();
    await expect(
        dialog.getByText('This sign-in expired. Try again to get a new link.')
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog.getByText('Waiting for you to sign in')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath('sign-in-mobile.png'),
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath('sign-in-dark.png'),
    });
    signIn.approve();
    await expect(page.getByRole('dialog', { name: 'Cursor connected' })).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(detail.getByText('Ready', { exact: true })).toBeVisible();
    await expect(detail.getByText(/Connected as delegate@example.com/u)).toBeVisible();
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
    let signIn: 'waiting' | 'failed' | null = null;
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
        if (frame.operation?.kind === 'connect') {
            signIn = 'waiting';
        }
        if (frame.operation?.kind === 'cancel-sign-in') {
            signIn = null;
        }
        if (frame.operation?.kind === 'disconnect') {
            connected = false;
            signIn = null;
        }
        socket.send(
            JSON.stringify({
                requestId: frame.requestId,
                result: {
                    ...(signIn
                        ? {
                              signIn:
                                  signIn === 'waiting'
                                      ? {
                                            status: 'waiting',
                                            url: 'https://cursor.com/loginDeepControl?uuid=haus-e2e',
                                            expiresAt: new Date(Date.now() + 300_000).toISOString(),
                                        }
                                      : {
                                            status: 'failed',
                                            message:
                                                'This sign-in expired. Try again to get a new link.',
                                        },
                          }
                        : {}),
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
    return {
        approve: () => {
            connected = true;
            signIn = null;
        },
        expire: () => {
            signIn = 'failed';
        },
    };
}
