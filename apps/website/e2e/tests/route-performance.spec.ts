import { createTestServer, openSettings, sectionLink } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('cold Tasks navigation paints its shell before the Tasks module arrives', async ({
    page,
}, testInfo) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/src/features/tasks/tasks-page.tsx*', async (route) => {
        await held;
        await route.continue();
    });
    await createTestServer(page, { displayName: 'Route performance', slug: 'route-performance' });
    await expect(sectionLink(page, 'Tasks')).toBeVisible();
    try {
        const samples = await sectionLink(page, 'Tasks').evaluate(async (row) => {
            row.dispatchEvent(
                new PointerEvent('pointerdown', {
                    bubbles: true,
                    button: 0,
                    isPrimary: true,
                    pointerType: 'mouse',
                })
            );
            const frames: boolean[] = [];
            for (let index = 0; index < 60; index += 1) {
                await new Promise(requestAnimationFrame);
                frames.push(Boolean(document.querySelector('section[aria-label="Tasks"]')));
            }
            return frames;
        });
        await testInfo.attach('route-shell-frames', {
            body: JSON.stringify({
                frames: samples,
                firstShellFrame: samples.findIndex(Boolean) + 1,
            }),
            contentType: 'application/json',
        });
        expect(samples.some(Boolean)).toBe(true);
        await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Tasks');
        await expect(page.getByRole('toolbar', { name: 'Task filters' })).toHaveCount(0);
        await expect(page.locator('.skeleton')).toHaveCount(0);
    } finally {
        release();
    }
    await expect(page.getByRole('toolbar', { name: 'Task filters' })).toBeVisible();
    await expect(
        page.locator('section[aria-label="Tasks"]').getByRole('button', { name: 'New task' })
    ).toHaveCount(0);
});

test('Settings navigation changes the sidebar and title while section code is unavailable', async ({
    page,
}) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/src/routes/app/settings-route.tsx*', async (route) => {
        await held;
        await route.continue();
    });
    await createTestServer(page, {
        displayName: 'Settings performance',
        slug: 'settings-performance',
    });
    try {
        await openSettings(page);
        await expect(page.getByRole('row', { name: 'Back to chat', exact: true })).toBeVisible();
        await expect(page).toHaveTitle('Profile — Haus');
        await expect(page.locator('.skeleton')).toHaveCount(0);
    } finally {
        release();
    }
    await expect(page.getByRole('heading', { name: 'Identity', exact: true })).toBeVisible();
});

test('default channel marks leave the icon catalog unloaded until the picker opens', async ({
    page,
}) => {
    const catalogRequests: string[] = [];
    page.on('request', (request) => {
        if (request.url().includes('channel-icon-catalog.generated')) {
            catalogRequests.push(request.url());
        }
    });
    const warmed = page.waitForResponse((response) =>
        response.url().includes('/features/tasks/tasks-page.tsx')
    );
    await createTestServer(page, { displayName: 'Icon performance', slug: 'icon-performance' });
    await expect(page.getByRole('row', { name: 'all', exact: true })).toBeVisible();
    await warmed;
    expect(catalogRequests).toEqual([]);
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await page.getByRole('button', { name: 'Icon and color', exact: true }).click();
    await expect.poll(() => catalogRequests.length).toBe(1);
    await page.getByRole('searchbox', { name: 'Search icons' }).fill('rocket');
    await expect(page.getByRole('button', { name: 'Rocket', exact: true })).toBeVisible();
});

test('cold channel navigation shows the selected identity while conversation code loads', async ({
    page,
}) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/src/features/servers/chat/chat-view.tsx*', async (route) => {
        await held;
        await route.continue();
    });
    await createTestServer(page, {
        displayName: 'Chat shell performance',
        slug: 'chat-shell-performance',
    });
    try {
        await page.getByRole('row', { name: 'all', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'all', exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'all', exact: true })).toHaveAttribute(
            'aria-busy',
            'true'
        );
        await expect(page.getByRole('textbox', { name: 'Message all', exact: true })).toHaveCount(
            0
        );
    } finally {
        release();
    }
    await expect(page.getByRole('textbox', { name: 'Message all', exact: true })).toBeVisible();
});
