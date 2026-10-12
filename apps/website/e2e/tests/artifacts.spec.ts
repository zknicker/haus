import { seedArtifactLibrary } from '../support/artifacts.ts';
import { createTestServer, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a Server member opens the shared library and reloads its stable address', async ({
    page,
}) => {
    const slug = 'artifact-library-smoke';
    const { client, server } = await createTestServer(page, {
        displayName: 'Artifact Library Smoke',
        slug,
    });

    await openSection(page, 'Artifacts');
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts$`, 'u'));
    await expect(page.getByRole('heading', { name: 'No artifacts yet' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Folders' })).toHaveCount(0);
    expect(await client.artifact.list.query({ serverId: server.id })).toEqual({ artifacts: [] });
    expect(await client.artifact.creators.query({ serverId: server.id })).toEqual({
        creators: [],
    });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'No artifacts yet' })).toBeVisible();

    await openSection(page, 'Inbox');
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/inbox$`, 'u'));
    await openSection(page, 'Artifacts');
    await expect(page.getByRole('heading', { name: 'No artifacts yet' })).toBeVisible();
});

test('members browse folders and kinds, search, switch revisions and expand an image', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-media-library';
    const { server, session } = await createTestServer(page, {
        displayName: 'Media Library',
        slug,
    });
    const { conceptId } = await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await openSection(page, 'Artifacts');

    const today = page.getByRole('grid', { name: 'Today' });
    await expect(today.getByRole('row')).toHaveCount(5);
    await expect(today.getByRole('row', { name: 'Concept render' })).toContainText(
        'Image · You · just now'
    );

    const folders = page.getByRole('listbox', { name: 'Folders' });
    await expect(folders.getByRole('option')).toHaveText([
        /All files\s*5 files/u,
        /Yours\s*5 files/u,
    ]);
    await folders.getByRole('option', { name: 'Yours' }).click();
    await expect(page).toHaveURL(/creator=user%3A/u);
    await expect(folders.getByRole('option', { name: 'Yours' })).toHaveAttribute(
        'aria-selected',
        'true'
    );

    // The band names the open folder, and its Artifacts crumb leads back to All.
    const band = page.locator('header').filter({ hasText: 'Yours' });
    await expect(band.getByRole('link', { name: 'Artifacts', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'File type: All types', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Images', exact: true }).click();
    await expect(today.getByRole('row')).toHaveCount(2);
    await expect(page).toHaveURL(/kind=images/u);
    await page.getByRole('searchbox').fill('Concept');
    await expect(today.getByRole('row')).toHaveCount(1);

    await page.getByRole('radio', { name: 'Grid', exact: true }).click();
    const tile = today.getByRole('row', { name: 'Concept render' });
    await expect(tile.locator('img.artifact-cover')).toBeVisible();
    await page.getByRole('searchbox').fill('');
    await page.screenshot({ path: '/tmp/haus-artifacts-library.png', animations: 'disabled' });

    await tile.click();
    await expect(page.getByRole('heading', { name: 'Concept render', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Concept render', exact: true })).toBeVisible();
    const details = page.getByRole('complementary', { name: 'Artifact details' });
    await expect(details).toContainText('Created by');
    await details.getByRole('button', { name: 'View revision 1', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${conceptId}\\?revision=.*_r1$`, 'u'));
    await expect(page.getByText('Revision 1,', { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Revision 1,', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'Open latest', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${conceptId}$`, 'u'));
    await expect(details.getByText('Viewing')).toBeVisible();
    await page.screenshot({ path: '/tmp/haus-artifacts-viewer.png' });

    await page.getByRole('button', { name: 'Expand Concept render', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.setViewportSize({ width: 420, height: 900 });
    await expect(details).toBeVisible();
    // Latest ← fixed revision ← viewer ← the filtered library the file was opened from.
    await page.goBack();
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(/creator=user%3A.*kind=images/u);
    await expect(
        page.getByRole('button', { name: 'File type: Images', exact: true })
    ).toBeVisible();
});

test('an unavailable fixed revision reports an error within the persistent Server shell', async ({
    page,
}) => {
    const slug = 'artifact-revision-smoke';
    await createTestServer(page, { displayName: 'Artifact Revision Smoke', slug });

    await page.goto(`/s/${slug}/artifacts/art_missing?revision=rev_missing`);
    await expect(page.getByRole('alert')).toContainText('Artifact or revision was not found.');
    await expect(page.getByRole('row', { name: 'Inbox', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Artifact or revision was not found.');
    await openSection(page, 'Artifacts');
    await expect(page.getByRole('heading', { name: 'No artifacts yet' })).toBeVisible();
});
