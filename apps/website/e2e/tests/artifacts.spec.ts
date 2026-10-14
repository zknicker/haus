import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    routeArtifactUploads,
    seedArtifactLibrary,
    seededArtifactAgent,
    seededArtifactText,
} from '../support/artifacts.ts';
import { createTestServer, openSection, runPsql } from '../support/server.ts';
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
    await expect(page.getByRole('button', { name: 'Upload files' })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Folders' })).toHaveCount(0);
    expect(await client.artifact.list.query({ serverId: server.id })).toEqual({
        artifacts: [],
        folders: [],
        next_offset: null,
        summary: { folders: 0, files_in_folders: 0, files: 0 },
    });
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

test('members browse drive folders, filter by kind and creator, search, and open a file', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-media-library';
    const { server, session } = await createTestServer(page, {
        displayName: 'Media Library',
        slug,
    });
    const { conceptId } = await seedArtifactLibrary(page, session.databaseUrl, server.id);
    // The seeded Agent joins the shell's Agent list on a fresh load.
    await page.reload();
    await openSection(page, 'Artifacts');

    // The root holds its child folders, then only the files directly in it.
    const today = page.getByRole('grid', { name: 'Today' });
    await expect(today.getByRole('row')).toHaveCount(7);
    await expect(today.getByRole('row', { name: 'concept.png' })).toContainText(
        'Concept render · Image · You · just now'
    );
    const folders = page.getByRole('listbox', { name: 'Folders' });
    await expect(folders.getByRole('option')).toHaveText([
        /docs\s*1 file/u,
        /starter-kit\s*4 files/u,
    ]);

    await folders.getByRole('option', { name: 'starter-kit' }).click();
    await expect(page).toHaveURL(/folder=starter-kit$/u);
    // Newest first: the seed writes scripts after assets.
    await expect(folders.getByRole('option')).toHaveText([
        /scripts\s*2 files/u,
        /assets\s*1 file/u,
    ]);
    await expect(today.getByRole('row')).toHaveText([/README\.md/u]);
    await folders.getByRole('option', { name: 'scripts' }).click();
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts$/u);
    await expect(today.getByRole('row')).toHaveCount(2);
    await expect(folders).toHaveCount(0);

    // The band is the drive trail; each folder above is a way back.
    const trail = page.getByRole('navigation', { name: 'Drive path' });
    await expect(trail).toContainText('Artifacts');
    await expect(trail).toContainText('starter-kit');
    await expect(trail).toContainText('scripts');

    await page.getByRole('button', { name: 'Created by: Anyone', exact: true }).click();
    await page.getByRole('menuitemradio', { name: seededArtifactAgent }).click();
    await expect(page).toHaveURL(/creator=agent%3A/u);
    await expect(today.getByRole('row')).toHaveText([/tm_check\.py/u]);
    await page.reload();
    await expect(today.getByRole('row')).toHaveText([/tm_check\.py/u]);
    await page.getByRole('button', { name: `Created by: ${seededArtifactAgent}` }).click();
    await page.getByRole('menuitemradio', { name: 'Anyone', exact: true }).click();
    await expect(today.getByRole('row')).toHaveCount(2);

    await trail.getByRole('link', { name: 'starter-kit', exact: true }).click();
    await expect(page).toHaveURL(/folder=starter-kit$/u);
    await page.goBack();
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts$/u);
    await trail.getByRole('link', { name: 'Artifacts', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts$`, 'u'));

    // Search covers the whole subtree and names where each hit lives.
    await page.getByRole('searchbox').fill('logo');
    await expect(today.getByRole('row')).toHaveCount(1);
    await expect(today.getByRole('row', { name: 'logo.png' })).toContainText('starter-kit/assets');
    await expect(folders).toHaveCount(0);
    await page.getByRole('searchbox').fill('');

    await page.getByRole('button', { name: 'File type: All types', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Images', exact: true }).click();
    await expect(today.getByRole('row')).toHaveCount(2);
    await expect(page).toHaveURL(/kind=images/u);
    // Folder counts follow the filters; folders without a match disappear.
    await expect(folders.getByRole('option')).toHaveText([/starter-kit\s*1 file/u]);
    await page.getByRole('searchbox').fill('Concept');
    await expect(today.getByRole('row')).toHaveCount(1);

    await page.getByRole('radio', { name: 'Grid', exact: true }).click();
    const tile = today.getByRole('row', { name: 'concept.png' });
    await expect(tile.locator('img.artifact-cover')).toBeVisible();
    await page.getByRole('searchbox').fill('');
    await page.screenshot({ path: '/tmp/haus-artifacts-library.png', animations: 'disabled' });

    await tile.click();
    await expect(page.getByRole('heading', { name: 'Concept render', exact: true })).toBeVisible();
    await expect(trail).toContainText('concept.png');
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
    await expect(page).toHaveURL(/kind=images/u);
    await expect(
        page.getByRole('button', { name: 'File type: Images', exact: true })
    ).toBeVisible();
});

test('a viewer names the file by its drive path, each folder a way back', async ({ page }) => {
    const slug = 'artifact-viewer-path';
    const { server, session } = await createTestServer(page, { displayName: 'Viewer Path', slug });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await page.goto(`/s/${slug}/artifacts/art_${server.id}_tmcheck`);
    const trail = page.getByRole('navigation', { name: 'Drive path' });
    await expect(page.getByRole('heading', { name: 'tm_check.py', exact: true })).toBeVisible();
    await expect(trail).toContainText('scripts');
    await trail.getByRole('link', { name: 'scripts', exact: true }).click();
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts$/u);
    await expect(page.getByRole('grid', { name: 'Today' }).getByRole('row')).toHaveCount(2);
});

test('members upload files and folders into the open folder, replace, and rename', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-uploads';
    const { server, session } = await createTestServer(page, { displayName: 'Uploads', slug });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await routeArtifactUploads(page, session.databaseUrl, server.id);
    await page.goto(`/s/${slug}/artifacts?folder=starter-kit%2Fscripts`);
    const today = page.getByRole('grid', { name: 'Today' });
    await expect(today.getByRole('row')).toHaveCount(2);

    // A picked folder keeps its structure; OS noise never uploads.
    const folder = mkdtempSync(join(tmpdir(), 'haus-artifact-upload-'));
    mkdirSync(join(folder, 'tools', 'data'), { recursive: true });
    writeFileSync(join(folder, 'tools', 'lint.py'), 'print("lint")\n');
    writeFileSync(join(folder, 'tools', 'data', 'rules.json'), '{"rules": []}\n');
    writeFileSync(join(folder, 'tools', '.DS_Store'), 'noise');
    const folderPick = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Folder…', exact: true }).click();
    await (await folderPick).setFiles(join(folder, 'tools'));
    await expect(page.getByText('Uploaded 2 files')).toBeVisible();
    const folders = page.getByRole('listbox', { name: 'Folders' });
    await expect(folders.getByRole('option')).toHaveText([/tools\s*2 files/u]);

    // An existing name asks once; Replace overwrites it, new files land either way.
    const filesPick = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Files…', exact: true }).click();
    await (await filesPick).setFiles([
        { buffer: Buffer.from('#!/bin/sh\n'), mimeType: 'text/x-shellscript', name: 'setup.sh' },
        { buffer: Buffer.from('new'), mimeType: 'text/plain', name: 'new.txt' },
    ]);
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Replace 1 file?');
    await expect(confirm).toContainText('1 new file will be added either way.');
    await confirm.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect(page.getByText('Uploaded 2 files')).toBeVisible();
    await expect(today.getByRole('row')).toHaveCount(3);
    const setupRevisions = runPsql(
        session.databaseUrl,
        `select next_revision from artifacts where id = 'art_${server.id}_setup'`
    );
    expect(setupRevisions).toBe('4');

    await today.getByRole('button', { name: 'Actions for new.txt', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const rename = page.getByRole('dialog');
    await rename.getByRole('textbox', { name: 'Name' }).fill('renamed.txt');
    await rename.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(today.getByRole('row', { name: 'renamed.txt' })).toBeVisible();
    await expect(today.getByRole('row', { name: 'new.txt' })).toHaveCount(0);

    await folders.getByRole('option', { name: 'tools' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Rename folder', exact: true }).click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'Name' }).fill('utilities');
    await page.getByRole('dialog').getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(folders.getByRole('option')).toHaveText([/utilities\s*2 files/u]);
});

test('text artifacts render inline like workspace files, and oversize text offers a download', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-text-viewer';
    const { server, session } = await createTestServer(page, {
        displayName: 'Text Viewer',
        slug,
    });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await openSection(page, 'Artifacts');
    const today = page.getByRole('grid', { name: 'Today' });
    const preview = page.getByRole('region', { name: 'File preview' });

    await today.getByRole('row', { name: 'readme.md' }).click();
    await expect(preview.getByRole('heading', { name: 'Release notes' })).toBeVisible();
    await expect(preview.locator('strong')).toHaveText('inline text previews');

    await page.goBack();
    await today.getByRole('row', { name: 'notes.txt' }).click();
    await expect(preview.locator('pre')).toContainText(seededArtifactText.notes);

    await page.goBack();
    await today.getByRole('row', { name: 'server.log' }).click();
    await expect(preview).toContainText('Too large to preview.');
    await expect(preview.getByRole('button', { name: 'Download' })).toBeVisible();
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
