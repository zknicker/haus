import { seedArtifactLibrary } from '../support/artifacts.ts';
import { createTestServer } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a member copies a file’s public link, sees it marked public, and disables it', async ({
    context,
    page,
}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const slug = 'artifact-public-links';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Public Links',
        slug,
    });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    const artifactId = `art_${server.id}_tmcheck`;
    await page.goto(`/s/${slug}/artifacts/${artifactId}`);
    await expect(page.getByRole('heading', { name: 'tm_check.py', exact: true })).toBeVisible();
    await expect(page.getByText('Public link', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'File actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Disable public link' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Copy public link' }).click();
    await expect(page.getByText('Public link copied')).toBeVisible();
    const { link } = await client.artifact.publicLink.query({
        artifact_id: artifactId,
        serverId: server.id,
    });
    expect(link?.url).toMatch(/\/f\/[A-Za-z0-9_-]{32}$/u);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(link?.url);
    await expect(page.getByText('Public link', { exact: true })).toBeVisible();

    // The library row carries the mark too.
    await page.goto(`/s/${slug}/artifacts?folder=starter-kit%2Fscripts`);
    const row = page.getByRole('row', { name: /tm_check\.py/u });
    await expect(row.getByRole('img', { name: 'Public link' })).toBeVisible();
    await row.getByRole('button', { name: 'Actions for tm_check.py' }).click();
    await page.getByRole('menuitem', { name: 'Disable public link' }).click();
    await expect(page.getByText('Public link disabled')).toBeVisible();
    await expect(row.getByRole('img', { name: 'Public link' })).toHaveCount(0);
    expect(
        (await client.artifact.publicLink.query({ artifact_id: artifactId, serverId: server.id }))
            .link
    ).toBeNull();
});
