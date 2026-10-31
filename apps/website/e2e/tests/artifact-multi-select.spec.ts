import {
    libraryRows,
    librarySection,
    routeArtifactUploads,
    seedArtifactLibrary,
} from '../support/artifacts.ts';
import { createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Files selects many items Finder-style and acts on the whole selection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-multi-select';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Multi Select',
        slug,
    });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await page.goto(`/s/${slug}/artifacts`);
    const library = page.getByRole('grid', { name: 'Files' });
    const items = libraryRows(library);
    const selected = library.locator('[role="row"][aria-selected="true"]');
    const bar = page.getByRole('toolbar', { name: 'Selected items' });
    await expect(items).toHaveCount(9);

    // Shift-click runs a range in visual order, across the folder tiles and the date group.
    await items.nth(1).click();
    await items.nth(4).click({ modifiers: ['Shift'] });
    await expect(selected).toHaveCount(4);
    await expect(bar).toContainText('4 selected');
    await expect(bar).toContainText('1 folder');
    // Command-click toggles one item; Shift+Arrow extends from it.
    await items.nth(2).click({ modifiers: ['ControlOrMeta'] });
    await expect(selected).toHaveCount(3);
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'false');
    await items.nth(6).click({ modifiers: ['ControlOrMeta'] });
    await page.keyboard.press('Shift+ArrowDown');
    await expect(items.nth(7)).toHaveAttribute('aria-selected', 'true');
    // Command-A takes everything; Escape clears and the band's controls return.
    await page.keyboard.press('ControlOrMeta+a');
    await expect(selected).toHaveCount(9);
    await expect(bar).toContainText('9 selected');
    await page.keyboard.press('Escape');
    await expect(selected).toHaveCount(0);
    await expect(bar).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toBeVisible();

    // Right-clicking inside the selection acts on all of it; outside, it reselects first.
    const notes = items.filter({ hasText: 'notes.txt' });
    const readme = items.filter({ hasText: 'readme.md' });
    const log = items.filter({ hasText: 'server.log' });
    await notes.click();
    await readme.click({ modifiers: ['ControlOrMeta'] });
    await readme.click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toHaveAttribute('aria-label', 'Actions for 2 items');
    await expect(menu.getByRole('menuitem')).toHaveText([
        'Download as zip',
        'Copy links',
        'Move to…',
        'Delete…',
    ]);
    await expect(menu).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await log.click({ button: 'right' });
    await expect(menu).toHaveAttribute('aria-label', 'Actions for server.log');
    await expect(selected).toHaveCount(1);
    await expect(menu).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // Command-Shift-M moves the selection through the folder picker, in one request.
    await notes.click();
    await readme.click({ modifiers: ['ControlOrMeta'] });
    await page.keyboard.press('ControlOrMeta+Shift+m');
    const picker = page.getByRole('dialog');
    await expect(picker.getByRole('heading')).toHaveText('Move 2 items');
    await picker.getByRole('option', { name: 'docs' }).click();
    await picker.getByRole('button', { name: 'Move here' }).click();
    await expect(notes).toHaveCount(0);
    await expect(readme).toHaveCount(0);
    const docs = await client.artifact.list.query({ prefix: 'docs', serverId: server.id });
    expect(docs.artifacts.map((file) => file.path).sort()).toEqual([
        'docs/guide.md',
        'docs/notes.txt',
        'docs/readme.md',
    ]);

    // Downloading a selection asks the Server for a zip (no bucket in e2e, so it says why not).
    await log.click();
    await items.filter({ hasText: 'draft.mp3' }).click({ modifiers: ['ControlOrMeta'] });
    await bar.getByRole('button', { name: 'Download as zip' }).click();
    await expect(page.getByText('Could not download these files')).toBeVisible();
});

test('dragging items onto a folder tile or a trail crumb moves them; into itself is a no-op', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-drag-move';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Drag Move',
        slug,
    });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await page.goto(`/s/${slug}/artifacts`);
    const items = libraryRows(page.getByRole('grid', { name: 'Files' }));
    const folders = librarySection(page, 'Folders');
    const docs = folders.getByRole('row', { name: 'docs' });
    const kit = folders.getByRole('row', { name: 'starter-kit' });

    // Dragging a selected row carries the whole selection onto the folder.
    const concept = items.filter({ hasText: 'concept.png' });
    const large = items.filter({ hasText: 'large.png' });
    await concept.click();
    await large.click({ modifiers: ['ControlOrMeta'] });
    await large.dragTo(docs);
    await expect(concept).toHaveCount(0);
    await expect(large).toHaveCount(0);
    const moved = await client.artifact.list.query({ prefix: 'docs', serverId: server.id });
    expect(moved.artifacts.map((file) => file.path).sort()).toEqual([
        'docs/concept.png',
        'docs/guide.md',
        'docs/large.png',
    ]);

    // A folder dropped on itself stays put.
    await kit.dragTo(kit, { targetPosition: { x: 30, y: 30 } });
    await expect(kit).toHaveCount(1);

    // A trail crumb is a drop target too: the assets folder goes back up to Files.
    await kit.dblclick();
    await expect(page).toHaveURL(/folder=starter-kit$/u);
    const assets = librarySection(page, 'Folders').getByRole('row', { name: 'assets' });
    const crumb = page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: 'Files', exact: true });
    // Several small moves, so the crumb sees dragenter and dragover as a pointer would give it.
    await assets.hover();
    await page.mouse.down();
    await crumb.hover({ position: { x: 4, y: 4 } });
    await crumb.hover({ position: { x: 8, y: 6 } });
    await expect(crumb.locator('[data-drop-target]')).toHaveCount(1);
    await page.mouse.up();
    await expect(assets).toHaveCount(0);
    const root = await client.artifact.list.query({ serverId: server.id });
    expect(root.folders.map((entry) => entry.path)).toContain('assets');
});

test('bulk delete says how many of the selection this member may delete', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-bulk-delete';
    const { server, session } = await createTestServer(page, {
        displayName: 'Bulk Delete',
        slug,
    });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    runPsql(
        session.databaseUrl,
        `update server_memberships set role = 'member'
         where server_id = '${server.id}'
           and user_id = (select id from users where id = 'usr_e2e_human')`
    );
    await page.goto(`/s/${slug}/artifacts?folder=starter-kit%2Fscripts`);
    const items = libraryRows(page.getByRole('grid', { name: 'Files' }));
    await expect(items).toHaveCount(2);
    await page.keyboard.press('Tab');
    await items.first().click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    const confirm = page.getByRole('alertdialog');
    await expect(confirm.getByRole('heading')).toHaveText('Delete 1 file?');
    await expect(confirm).toContainText('1 of 2 selected items can be deleted');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
});

test('files dropped from the system still upload when they land on a row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-drop-on-row';
    const { server, session } = await createTestServer(page, { displayName: 'Drop', slug });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await routeArtifactUploads(page, session.databaseUrl, server.id);
    await page.goto(`/s/${slug}/artifacts?folder=docs`);
    const row = libraryRows(librarySection(page, 'Today')).filter({ hasText: 'guide.md' });
    await row.evaluate((element) => {
        const data = new DataTransfer();
        data.items.add(new File(['dropped'], 'dropped.txt', { type: 'text/plain' }));
        for (const type of ['dragenter', 'dragover', 'drop']) {
            element.dispatchEvent(
                new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data })
            );
        }
    });
    await expect(page.getByText('Uploaded 1 file')).toBeVisible();
});
