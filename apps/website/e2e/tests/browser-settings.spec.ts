import {
    type AgentRuntimeBrowserSettings,
    browserRequestSchema,
    cloudAgentCapabilityRequestSchema,
} from '@haus/api';
import { sendBootstrap, socketMessage, socketOpen } from '../support/computer-socket.ts';
import { attachComputer, createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

const application = { path: '/Applications/Google Chrome.app', version: '153.0.8010.50' };
const existingProfile =
    '/Users/test/Library/Application Support/Shared Browser Automation/Persistent Browser Profiles/chrome-profile';
const otherProfile = '/Volumes/QA/Browser Profiles/chrome-profile';

test('an Owner connects an existing browser, sees its identity, and disconnects', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const slug = 'shared-browser-hq';
    const { client } = await createTestServer(page, { displayName: 'Shared Browser HQ', slug });
    const credential = 'shared-browser-test-credential-1234';
    await attachComputer(client, { credential, slug });
    const computer = new WebSocket(
        `ws://127.0.0.1:${process.env.HAUS_SERVER_PORT}/computer/attachment`
    );
    await socketOpen(computer);
    const accepted = socketMessage(computer);
    sendBootstrap(computer, credential, 'complete');
    expect(await accepted).toMatchObject({ mode: 'ordinary' });
    const fixture = answerBrowserRequests(computer);
    try {
        await page.goto(`/s/${slug}/computers`);
        await page.getByRole('button', { name: 'Configure', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Browser', exact: true });
        await expect(dialog.getByRole('button', { name: 'Running browser' })).toContainText(
            'chrome-profile'
        );
        await expect(dialog.getByText('Managed by', { exact: true })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Running browser' }).click();
        await page.getByRole('option').filter({ hasText: otherProfile }).click();
        await expect(dialog.getByText(otherProfile, { exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: 'Running browser' }).click();
        await page.getByRole('option').filter({ hasText: existingProfile }).click();
        const profileLabel = await dialog.getByText('Profile', { exact: true }).boundingBox();
        const profileValue = await dialog.getByText(existingProfile, { exact: true }).boundingBox();
        const dialogBox = await dialog.boundingBox();
        expect(profileLabel && profileValue && dialogBox).toBeTruthy();
        if (profileLabel && profileValue && dialogBox) {
            expect(profileValue.x).toBeGreaterThanOrEqual(profileLabel.x + profileLabel.width);
            expect(profileValue.x + profileValue.width).toBeLessThanOrEqual(
                dialogBox.x + dialogBox.width
            );
        }
        await expect(dialog.getByText(application.path, { exact: true })).toBeVisible();
        await expect(dialog.getByText(application.version, { exact: true })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Browser source' })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
        await expect
            .poll(() => fixture.settings().connection)
            .toEqual({ applicationPath: application.path, userDataDir: existingProfile });
        await expect(dialog).toBeHidden();
        await page.getByRole('button', { name: 'Chrome actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Restart Chrome' })).toHaveCount(0);
        await page.getByRole('menuitem', { name: 'Disconnect Browser' }).click();
        await expect.poll(() => fixture.settings().enabled).toBe(false);
        await page.getByRole('button', { name: 'Chrome actions' }).click();
        await expect(page.getByRole('menuitem', { name: 'Open Chrome' })).toHaveCount(0);
        await page.getByRole('menuitem', { name: 'Connect Browser' }).click();
        await expect.poll(() => fixture.settings().enabled).toBe(true);
    } finally {
        computer.close();
    }
});

function answerBrowserRequests(socket: WebSocket) {
    let settings: AgentRuntimeBrowserSettings = {
        browsers: [
            {
                applicationPath: application.path,
                userDataDir: existingProfile,
                name: 'chrome-profile',
                version: application.version,
                available: true,
            },
            {
                applicationPath: application.path,
                userDataDir: otherProfile,
                name: 'chrome-profile',
                version: application.version,
                available: true,
            },
        ],
        connection: null,
        configured: false,
        enabled: false,
        status: null,
        updatedAt: null,
    };
    socket.addEventListener('message', (event) => {
        const frame: unknown = JSON.parse(String(event.data));
        const cloud = cloudAgentCapabilityRequestSchema.safeParse(frame);
        if (cloud.success) {
            socket.send(
                JSON.stringify({
                    type: 'cloud-agent-capability-result',
                    requestId: cloud.data.requestId,
                    error: 'Not configured in browser fixture.',
                })
            );
            return;
        }
        const request = browserRequestSchema.safeParse(frame);
        if (!request.success) {
            return;
        }
        const { operation, requestId } = request.data;
        if (operation.kind === 'save') {
            settings = {
                ...settings,
                ...operation.input,
                configured: true,
                updatedAt: new Date().toISOString(),
            };
        }
        socket.send(
            JSON.stringify({
                type: 'browser-result',
                requestId,
                result: { kind: 'settings', value: settings },
            })
        );
    });
    return { settings: () => settings };
}
