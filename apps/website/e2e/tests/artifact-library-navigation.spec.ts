import { libraryRows, librarySection, seedArtifactLibrary } from '../support/artifacts.ts';
import { createTestServer, runPsql } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('Files selects on click, opens on double click or Return, and Back walks the tab history', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-navigation';
    const { client, server, session } = await createTestServer(page, {
        displayName: 'Navigation',
        slug,
    });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    // A deep folder for the trail to fold: starter-kit/scripts/a/b/c.
    await client.artifact.move.mutate({
        from: 'starter-kit/scripts/setup.sh',
        serverId: server.id,
        to: 'starter-kit/scripts/a/b/c/setup.sh',
    });
    await page.goto(`/s/${slug}/artifacts`);
    const folders = librarySection(page, 'Folders');
    const back = page.getByRole('button', { name: 'Back', exact: true });
    const forward = page.getByRole('button', { name: 'Forward', exact: true });
    // Back is the shell's: it steps to the Server page before Files, not just folders.
    await expect(back).toBeEnabled();
    await expect(forward).toBeDisabled();

    // A click selects a folder without opening it; Return opens the selection.
    const starterKit = folders.getByRole('row', { name: 'starter-kit' });
    await starterKit.click();
    await expect(starterKit).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts$`, 'u'));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/folder=starter-kit$/u);
    await expect(back).toBeEnabled();

    // A filter change replaces the entry, so Back still steps folders.
    await page.getByRole('button', { name: 'File type: All types', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Documents', exact: true }).click();
    await expect(page).toHaveURL(/folder=starter-kit&kind=documents$/u);
    await page.getByRole('button', { name: 'File type: Documents', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'All types', exact: true }).click();

    for (const name of ['scripts', 'a', 'b', 'c']) {
        await folders.getByRole('row', { name }).dblclick();
    }
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts%2Fa%2Fb%2Fc$/u);

    // Every ancestor is a link; the middle of a deep trail folds into a menu; the open folder is not.
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(trail.locator('a[href]')).toHaveText(['Haus', 'Files', 'b']);
    await expect(trail.getByText('c', { exact: true })).toHaveAttribute('aria-current', 'page');
    await trail.getByRole('button', { name: 'Show enclosing places' }).click();
    const enclosing = page.getByRole('menu', { name: 'Enclosing places' });
    await expect(enclosing.getByRole('menuitem')).toHaveText(['starter-kit', 'scripts', 'a']);
    await enclosing.getByRole('menuitem', { name: 'scripts' }).click();
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts$/u);

    // Back and Forward walk the history and agree with the browser's.
    await back.click();
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts%2Fa%2Fb%2Fc$/u);
    await forward.click();
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts$/u);
    await expect(forward).toBeDisabled();
    await page.goBack();
    await expect(page).toHaveURL(/folder=starter-kit%2Fscripts%2Fa%2Fb%2Fc$/u);
    await expect(forward).toBeEnabled();

    // Files follow Finder too: click selects, arrows move, Return opens the viewer.
    await page.goto(`/s/${slug}/artifacts`);
    const rows = libraryRows(librarySection(page, 'Today'));
    await rows.nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts$`, 'u'));
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'false');
    await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/artifacts/art_`, 'u'));
});

test('right-clicking an item selects it and offers only the actions this member can run', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'artifact-context-menu';
    const { server, session } = await createTestServer(page, { displayName: 'Context', slug });
    await seedArtifactLibrary(page, session.databaseUrl, server.id);
    await page.goto(`/s/${slug}/artifacts?folder=starter-kit%2Fscripts`);
    const today = librarySection(page, 'Today');
    const agentFile = today.getByRole('row', { name: /tm_check\.py/u });

    await agentFile.click({ button: 'right' });
    await expect(agentFile).toHaveAttribute('aria-selected', 'true');
    const fileActions = [
        'Open',
        'Download',
        'Copy link',
        'Copy public link',
        'Copy path',
        'Rename',
        'Move to…',
        'Version history',
        'Delete…',
    ];
    const menuItems = page.getByRole('menu').getByRole('menuitem');
    await expect(menuItems).toHaveText(fileActions);
    // The ⋮ menu renders the same list.
    await page.keyboard.press('Escape');
    await agentFile.getByRole('button', { name: 'Actions for tm_check.py' }).click();
    await expect(menuItems).toHaveText(fileActions);
    await page.keyboard.press('Escape');

    // Shift+F10 opens the menu for the focused row; Move to… walks folders and keeps the name.
    const setup = today.getByRole('row', { name: /setup\.sh/u });
    await setup.click();
    await page.keyboard.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Move to…' }).click();
    const move = page.getByRole('dialog');
    await expect(move.getByRole('heading')).toHaveText('Move “setup.sh”');
    await move
        .getByRole('navigation', { name: 'Destination folder' })
        .getByText('starter-kit')
        .click();
    await move.getByRole('option', { name: 'assets' }).click();
    await move.getByRole('button', { name: 'Move here' }).click();
    await expect(today.getByRole('row', { name: /setup\.sh/u })).toHaveCount(0);

    // Delete confirms first, then calls the Server (which has no bucket in e2e).
    await agentFile.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete…' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Delete “tm_check.py”?');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);

    // A member loses Delete on files they did not create.
    runPsql(
        session.databaseUrl,
        `update server_memberships set role = 'member'
         where server_id = '${server.id}'
           and user_id = (select id from users where id = 'usr_e2e_human')`
    );
    await page.reload();
    await agentFile.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Delete…' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // The empty area offers uploads into the open folder.
    await page.mouse.click(900, 900, { button: 'right' });
    await expect(menuItems).toHaveText(['Upload files…', 'Upload folder…']);
});

test.describe('on a touch screen', () => {
    test.use({ hasTouch: true });

    test('a tap opens a folder at once', async ({ page }) => {
        const slug = 'artifact-touch';
        const { server, session } = await createTestServer(page, { displayName: 'Touch', slug });
        await seedArtifactLibrary(page, session.databaseUrl, server.id);
        await page.goto(`/s/${slug}/artifacts`);
        await librarySection(page, 'Folders').getByRole('row', { name: 'docs' }).tap();
        await expect(page).toHaveURL(/folder=docs$/u);
    });
});
