import { expect, test } from 'bun:test';
import { ARTIFACT_REVISION_RETENTION_DAYS } from '@haus/api';
import { deleteExpiredArtifactRevisions } from '../src/artifacts/retention.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

/**
 * Revision retention counts from the moment a newer revision replaced a revision, never from
 * the revision's own age, and never touches a file's current revision.
 */
const { publish, state, storage } = artifactDriveFixture('artifact-retention');
const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-15T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * day);

test('prunes revisions replaced before the window and keeps the current revision', async () => {
    const first = await publish({ body: 'one', path: 'prune/report.txt' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'prune/report.txt',
    });
    const third = await publish({
        base: second.artifact.revision_id,
        body: 'three',
        path: 'prune/report.txt',
    });
    await age(first.artifact.revision_id, daysAgo(40));
    await age(second.artifact.revision_id, daysAgo(ARTIFACT_REVISION_RETENTION_DAYS + 1));
    await age(third.artifact.revision_id, daysAgo(ARTIFACT_REVISION_RETENTION_DAYS - 1));

    const deleted = await deleteExpiredArtifactRevisions(state.connection.db, storage, now);

    // `first` was replaced by `second` eight days ago; `second` only by `third` six days ago.
    expect(deleted.map((row) => row.id)).toEqual([first.artifact.revision_id]);
    expect(await revisionIds(first.artifact.artifact_id)).toEqual([
        second.artifact.revision_id,
        third.artifact.revision_id,
    ]);
    expect(storage.objects.has(objectKey(first.artifact))).toBe(false);
    expect(storage.objects.has(objectKey(second.artifact))).toBe(true);
});

test('an old current revision with no successor is always kept', async () => {
    const only = await publish({ body: 'alone', path: 'prune/alone.txt' });
    await age(only.artifact.revision_id, daysAgo(400));
    await deleteExpiredArtifactRevisions(state.connection.db, storage, now);
    expect(await revisionIds(only.artifact.artifact_id)).toEqual([only.artifact.revision_id]);
});

test('a storage failure leaves the revision claimed for startup cleanup', async () => {
    const first = await publish({ body: 'one', path: 'prune/stuck.txt' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'prune/stuck.txt',
    });
    await age(second.artifact.revision_id, daysAgo(30));
    const failing = Object.assign(Object.create(storage) as typeof storage, {
        delete: () => Promise.reject(new Error('R2 unavailable')),
    });
    await expect(deleteExpiredArtifactRevisions(state.connection.db, failing, now)).rejects.toThrow(
        'pending cleanup'
    );
    const [row] = (await state.harness.sql`
        select state from artifact_revisions where id = ${first.artifact.revision_id}
    `) as { state: string }[];
    expect(row?.state).toBe('deleting');
});

async function age(revisionId: string, createdAt: Date) {
    await state.harness.sql`
        update artifact_revisions set created_at = ${createdAt} where id = ${revisionId}
    `;
}

async function revisionIds(artifactId: string) {
    const rows = (await state.harness.sql`
        select id from artifact_revisions where artifact_id = ${artifactId} order by revision_number
    `) as { id: string }[];
    return rows.map((row) => row.id);
}

function objectKey(artifact: { artifact_id: string; revision_id: string }) {
    return `servers/${state.serverId}/artifacts/${artifact.artifact_id}/${artifact.revision_id}`;
}
