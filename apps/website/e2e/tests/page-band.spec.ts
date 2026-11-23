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
        ['tasks', ['Haus', 'Tasks']],
        ['activity', ['Haus', 'Activity']],
        ['search', ['Haus', 'Search']],
        ['artifacts', ['Haus', 'Drive']],
    ] as const;
    for (const [path, crumbs] of surfaces) {
        await page.goto(`/s/${slug}/${path}`);
        await expect(trail.getByRole('listitem')).toHaveText([...crumbs]);
        await expect(trail.getByRole('link', { name: 'Haus', exact: true })).toHaveAttribute(
            'href',
            `/s/${slug}`
        );
        // The chevrons precede the trail on every surface.
        const [backBox, trailBox] = await Promise.all([back.boundingBox(), trail.boundingBox()]);
        expect(backBox && trailBox && backBox.x < trailBox.x).toBeTruthy();
    }

    // A top-level Settings page draws no trail: the rail, title and tab say where you are.
    await page.goto(`/s/${slug}/settings/profile`);
    await expect(trail).toHaveCount(0);

    // Back and Forward step the tab's history across surfaces, not one page's own.
    await expect(forward).toBeDisabled();
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts$`, 'u'));
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/search$`, 'u'));
    await forward.click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts$`, 'u'));
});
