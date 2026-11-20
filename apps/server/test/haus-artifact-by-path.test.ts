import { expect, test } from 'bun:test';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state } = artifactDriveFixture('artifact-by-path');

test('a drive path finds its live file whatever its case, at a pinned revision of its own', async () => {
    const first = await publish({ body: '<h1>One</h1>', path: 'haus/pages/Plan.html' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: '<h1>Two</h1>',
        path: 'haus/pages/Plan.html',
    });
    const other = await publish({ path: 'haus/pages/other.html' });
    const byPath = (path: string, revisionId?: string) =>
        state.owner.trpc.artifact.byPath.query({
            path,
            revision_id: revisionId,
            serverId: state.serverId,
        });

    const current = await byPath('HAUS/pages/plan.html');
    expect(current.artifact).toMatchObject({
        artifact_id: first.artifact.artifact_id,
        path: 'haus/pages/Plan.html',
        revision_id: second.artifact.revision_id,
        revision_number: 2,
    });

    const pinned = await byPath('haus/pages/Plan.html', first.artifact.revision_id);
    expect(pinned.artifact).toMatchObject({
        artifact_id: first.artifact.artifact_id,
        revision_id: first.artifact.revision_id,
        revision_number: 1,
    });

    await expect(byPath('haus/pages/Plan.html', other.artifact.revision_id)).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
    });
    await expect(byPath('haus/pages/missing.html')).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
    });
});
