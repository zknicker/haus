import { seededArtifactText } from '../support/artifact-transport.ts';
import {
    libraryRows,
    librarySection,
    seedArtifactLibrary,
    seededArtifactAgent,
} from '../support/artifacts.ts';
import { createTestServer, openSection } from '../support/server.ts';
import { expect, test } from '../support/test.ts';

test('a member walks Drive from its areas to a file, compares two revisions, and restores the older', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const slug = 'drive-page';
    const { server, session } = await createTestServer(page, { displayName: 'Drive Page', slug });
    const { notesId } = await seedArtifactLibrary(page, session, server.id);
    await page.reload();
    await openSection(page, 'Drive');
    const folders = librarySection(page, 'Folders');
    const upload = page.getByRole('button', { name: 'Upload', exact: true });
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' });

    await expect(folders.getByRole('row')).toHaveText([
        /Haus\s*12 files/u,
        /Projects\s*0 files/u,
        /Captains\s*0 files/u,
    ]);
    await expect(upload).toHaveCount(0);

    await folders.getByRole('row', { name: 'Captains' }).dblclick();
    await expect(page).toHaveURL(/folder=agents$/u);
    await expect(folders.getByRole('row')).toHaveText([
        new RegExp(`${seededArtifactAgent}\\s*0 files`, 'u'),
    ]);
    await expect(upload).toHaveCount(0);

    await trail.getByRole('link', { name: 'Drive', exact: true }).click();
    await folders.getByRole('row', { name: 'Haus' }).dblclick();
    await expect(upload).toBeVisible();
    await libraryRows(librarySection(page, 'Today')).filter({ hasText: 'notes.txt' }).dblclick();
    await expect(page).toHaveURL(new RegExp(`/artifacts/${notesId}\\?in=haus$`, 'u'));
    const preview = page.getByRole('region', { name: 'File preview' });
    await expect(preview).toContainText(seededArtifactText.notes);

    const details = page.getByRole('complementary', { name: 'File details' });
    const revisions = details.getByText(/^Revision \d+$/u);
    await expect(revisions).toHaveText(['Revision 2', 'Revision 1']);

    await details.getByRole('button', { name: 'Revision 2 actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Compare', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`compare=${notesId}_r1`, 'u'));
    const changes = page.getByRole('region', { name: 'Changes' });
    await expect(changes.getByText(seededArtifactText.notesFirst)).toBeVisible();
    await expect(changes.getByText(seededArtifactText.notes)).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page).not.toHaveURL(/compare=/u);
    await expect(changes).toHaveCount(0);
    await expect(preview).toContainText(seededArtifactText.notes);

    await details.getByRole('button', { name: 'Revision 1 actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
    await expect(page.getByText('Restored as revision 3')).toBeVisible();
    await expect(revisions).toHaveText(['Revision 3', 'Revision 2', 'Revision 1']);
});
