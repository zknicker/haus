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
    await expect(page.getByRole('heading', { name: 'No artifacts here' })).toBeVisible();
    await expect(page.getByText('Files agents publish to this Server appear here.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(await client.artifact.list.query({ serverId: server.id })).toEqual({ artifacts: [] });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'No artifacts here' })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No artifacts here' })).toBeVisible();

    await openSection(page, 'Inbox');
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/inbox$`, 'u'));
    await openSection(page, 'Artifacts');
    await expect(page.getByRole('heading', { name: 'No artifacts here' })).toBeVisible();
});

test('members browse mixed files, search, switch revisions and expand an image', async ({
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
    await expect(page.getByRole('link', { name: 'Concept render', exact: true })).toBeVisible();
    await expect(page.getByText('5 files on this page')).toBeVisible();
    await page.getByRole('radio', { name: 'Images', exact: true }).click();
    await expect(page.getByText('2 files on this page')).toBeVisible();
    await page.getByRole('searchbox').fill('Concept');
    await expect(page.getByText('1 file on this page')).toBeVisible();
    await page.getByRole('radio', { name: 'List', exact: true }).click();
    await expect(page.getByText('Concept render', { exact: true })).toBeVisible();
    await page.getByText('Concept render', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Concept render', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All artifacts' }).click();
    await expect(page.getByRole('radio', { name: 'All files', exact: true })).toBeChecked();
    await expect(page.getByText('5 files on this page')).toBeVisible();
    await page.screenshot({ path: '/tmp/haus-artifacts-library.png', animations: 'disabled' });
    await page.getByRole('link', { name: 'Concept render', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Concept render', exact: true })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Artifact details' })).toBeVisible();
    await page.getByRole('link', { name: 'Revision 1', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${conceptId}\\?revision=.*_r1$`, 'u'));
    await expect(page.getByText('Revision 1 · Fixed revision')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Revision 1 · Fixed revision')).toBeVisible();
    await page.getByRole('link', { name: 'Open latest', exact: true }).click();
    await expect(page.getByText('Revision 2 · Latest')).toBeVisible();
    await page.screenshot({ path: '/tmp/haus-artifacts-viewer.png' });
    await page.getByRole('button', { name: 'Expand', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 768, height: 1000 });
    await expect(page.getByRole('complementary', { name: 'Artifact details' })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'No artifacts here' })).toBeVisible();
});
