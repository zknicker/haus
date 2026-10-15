import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('every surface leads its band with Back, Forward, and a Haus trail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'page-band';
    await createTestServer(page, { displayName: 'Page Band', slug });
    const back = page.getByRole('button', { name: 'Back', exact: true });
    const forward = page.getByRole('button', { name: 'Forward', exact: true });
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' });

    const surfaces = [
        ['inbox', ['Haus', 'Inbox']],
        ['tasks', ['Haus', 'Tasks']],
        ['activity', ['Haus', 'Activity']],
        ['search', ['Haus', 'Search']],
        ['artifacts', ['Haus', 'Files']],
        ['settings/profile', ['Haus', 'Settings', 'Profile']],
        ['archived', ['Haus', 'Settings', 'Archived chats']],
    ] as const;
    for (const [path, crumbs] of surfaces) {
        await page.goto(`/s/${slug}/${path}`);
        await expect(trail.getByRole('listitem')).toHaveText([...crumbs]);
        await expect(trail.getByRole('link', { name: 'Haus', exact: true })).toHaveAttribute(
            'href',
            `/s/${slug}/inbox`
        );
        // The chevrons precede the trail on every surface.
        const [backBox, trailBox] = await Promise.all([back.boundingBox(), trail.boundingBox()]);
        expect(backBox && trailBox && backBox.x < trailBox.x).toBeTruthy();
    }

    // Back and Forward step the tab's history across surfaces, not one page's own.
    await expect(forward).toBeDisabled();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/profile$`, 'u'));
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts$`, 'u'));
    await forward.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/settings/profile$`, 'u'));
});
