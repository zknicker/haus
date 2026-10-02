import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('cold Tasks navigation paints its shell before the task body module arrives', async ({
    page,
}, testInfo) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/src/features/servers/tasks/task-content.tsx*', async (route) => {
        await held;
        await route.continue();
    });
    await createTestServer(page, { displayName: 'Route performance', slug: 'route-performance' });
    await expect(page.getByRole('row', { name: 'Tasks', exact: true })).toBeVisible();
    try {
        const samples = await page
            .getByRole('row', { name: 'Tasks', exact: true })
            .evaluate(async (row) => {
                row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                const frames: boolean[] = [];
                for (let index = 0; index < 12; index += 1) {
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
        await expect(page.getByRole('button', { name: 'New Task', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'No tasks yet' })).toHaveCount(0);
        await expect(page.locator('.skeleton')).toHaveCount(0);
    } finally {
        release();
    }
    await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
});

test('Inbox reserves its greeting line without moving the date when identity arrives', async ({
    page,
}) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route(
        (url) =>
            url.pathname.startsWith('/trpc/') &&
            url.pathname.slice('/trpc/'.length).split(',').includes('member.list'),
        async (route) => {
            await held;
            await route.continue();
        }
    );
    await createTestServer(page, {
        displayName: 'Greeting performance',
        slug: 'greeting-performance',
    });
    const header = page.locator('header').filter({ has: page.locator('h1') });
    const date = header.locator('p');
    let before: { y: number } | null = null;
    try {
        await page.getByRole('row', { name: 'Inbox', exact: true }).click();
        await expect(date).toBeVisible();
        await expect(header.locator('h1')).toBeEmpty();
        before = await date.boundingBox();
        expect(before).not.toBeNull();
    } finally {
        release();
    }
    await expect(header.locator('h1')).not.toBeEmpty();
    expect((await date.boundingBox())?.y).toBe(before?.y);
});

test('Settings navigation changes the sidebar and breadcrumb while section code is unavailable', async ({
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
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await expect(page.getByRole('row', { name: 'Back to chat', exact: true })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Breadcrumbs' })).toContainText('Profile');
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
        response.url().includes('/tasks-page-content.tsx')
    );
    await createTestServer(page, { displayName: 'Icon performance', slug: 'icon-performance' });
    await expect(page.getByRole('row', { name: 'all', exact: true })).toBeVisible();
    await warmed;
    expect(catalogRequests).toEqual([]);
    await page.getByRole('button', { name: 'New channel', exact: true }).click();
    await page.getByRole('button', { name: 'Icon and color', exact: true }).click();
    await expect.poll(() => catalogRequests.length).toBe(1);
    await page.getByRole('searchbox', { name: 'Search icons' }).fill('rocket');
    await expect(page.getByRole('button', { name: 'Rocket', exact: true })).toBeVisible();
});

test('Inbox labels stay mounted while its section code loads', async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/src/features/servers/inbox/inbox-active-agents.tsx*', async (route) => {
        await held;
        await route.continue();
    });
    await createTestServer(page, { displayName: 'Inbox performance', slug: 'inbox-performance' });
    try {
        await page.getByRole('row', { name: 'Inbox', exact: true }).click();
        for (const name of ['Active this week', 'Unread', 'Happening now']) {
            await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
        }
        await expect(page.getByText('All caught up.', { exact: true })).toHaveCount(0);
        await page.getByRole('heading', { name: 'Unread', exact: true }).evaluate((heading) => {
            Reflect.set(window, '__inboxSectionHeading', heading);
        });
    } finally {
        release();
    }
    await expect(page.getByText('All caught up.', { exact: true })).toBeVisible();
    expect(
        await page.evaluate(() => Reflect.get(window, '__inboxSectionHeading').isConnected)
    ).toBe(true);
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
