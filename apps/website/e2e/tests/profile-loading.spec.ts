import type { Page } from '@playwright/test';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Profile settings keeps fields visible while the directory request is held', async ({
    page,
}) => {
    const { server } = await createTestServer(page, {
        displayName: 'Profile loading',
        slug: 'profile-loading',
    });
    const held = await holdQuery(page, 'member.list');
    try {
        await page.goto(`/s/${server.slug}/settings/profile`);
        await held.requested;
        await expect(page.getByRole('heading', { name: 'Identity', exact: true })).toBeVisible();
        await expect(
            page.getByRole('textbox', { name: 'Display name', exact: true })
        ).toBeDisabled();
        await expect(page.getByRole('textbox', { name: 'Handle', exact: true })).toBeDisabled();
    } finally {
        held.release();
    }
    await expect(page.getByRole('textbox', { name: 'Display name', exact: true })).toBeEnabled();
});

test('Human profile keeps its structure while identity is unresolved', async ({ page }) => {
    const { server } = await createTestServer(page, {
        displayName: 'Human loading',
        slug: 'human-loading',
    });
    const held = await holdQuery(page, 'member.get');
    try {
        await page.goto(`/s/${server.slug}/settings/members/humans/${server.viewerUserId}`);
        await held.requested;
        for (const label of ['Role', 'Email', 'Joined']) {
            await expect(page.getByText(label, { exact: true })).toBeVisible();
        }
        await expect(page.getByRole('heading', { name: /Created Agents/u })).toBeVisible();
    } finally {
        held.release();
    }
    await expect(page.getByRole('button', { name: 'Edit Profile', exact: true })).toBeVisible();
});

test('Computers reserves its sections until the first roster confirms an empty result', async ({
    page,
}) => {
    const { server } = await createTestServer(page, {
        displayName: 'Computer loading',
        slug: 'computer-loading',
    });
    const held = await holdQuery(page, 'computer.list');
    try {
        await page.goto(`/s/${server.slug}/settings/computers`);
        await held.requested;
        for (const label of [
            'Runtimes',
            'Browser',
            'Cloud Agents',
            'Agents on This Computer',
            'System Log',
            'Computer Management',
        ]) {
            await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
        }
        await expect(page.getByText('Attach a Computer', { exact: true })).toBeHidden();
    } finally {
        held.release();
    }
    await expect(page.getByText('Attach a Computer', { exact: true })).toBeVisible();
});

async function holdQuery(page: Page, procedure: string) {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const matches = (url: URL) =>
        url.pathname.startsWith('/trpc/') &&
        url.pathname.slice('/trpc/'.length).split(',').includes(procedure);
    const requested = page.waitForRequest((request) => matches(new URL(request.url())));
    await page.route(matches, async (route) => {
        await gate;
        await route.continue();
    });
    return { release, requested };
}
