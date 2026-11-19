import { expect, test } from 'bun:test';
import { deleteExpiredArtifactRevisions } from '../src/artifacts/retention.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state, storage } = artifactDriveFixture('drive-deleted');

test('a delete keeps every revision and lists the file as recently deleted', async () => {
    const first = await publish({ body: 'one', path: 'haus/trash/keep.md' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'haus/trash/keep.md',
    });
    await publish({ path: 'haus/elsewhere/other.md' });
    await remove(first.artifact.artifact_id);

    expect(await revisionStates(first.artifact.artifact_id)).toEqual(['ready', 'ready']);
    expect(storage.objects.has(objectKey(first.artifact))).toBe(true);
    const listed = await state.owner.trpc.artifact.listDeleted.query({
        prefix: 'haus/trash',
        serverId: state.serverId,
    });
    expect(listed.next_offset).toBeNull();
    expect(listed.deleted.map((item) => [item.artifact.path, item.artifact.revision_id])).toEqual([
        ['haus/trash/keep.md', second.artifact.revision_id],
    ]);
    expect(
        (
            await state.owner.trpc.artifact.listDeleted.query({
                prefix: 'haus/elsewhere',
                serverId: state.serverId,
            })
        ).deleted
    ).toEqual([]);
});

test('restore brings a deleted file back on top of its last head', async () => {
    const first = await publish({ body: 'one', path: 'haus/restore/doc.md' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'haus/restore/doc.md',
    });
    await remove(first.artifact.artifact_id);
    const restored = await state.owner.trpc.artifact.restore.mutate({
        artifact_id: first.artifact.artifact_id,
        revision_id: first.artifact.revision_id,
        serverId: state.serverId,
    });
    expect(restored.artifact).toMatchObject({
        artifact_id: first.artifact.artifact_id,
        base_revision_id: second.artifact.revision_id,
        parent_revision_id: second.artifact.revision_id,
        path: 'haus/restore/doc.md',
        revision_number: 3,
        sha256: first.artifact.sha256,
    });
    expect(
        (
            await state.owner.trpc.artifact.listDeleted.query({
                prefix: 'haus/restore',
                serverId: state.serverId,
            })
        ).deleted
    ).toEqual([]);

    await remove(first.artifact.artifact_id);
    await publish({ path: 'haus/restore/doc.md', body: 'squatter' });
    await expect(
        state.owner.trpc.artifact.restore.mutate({
            artifact_id: first.artifact.artifact_id,
            revision_id: second.artifact.revision_id,
            serverId: state.serverId,
        })
    ).rejects.toMatchObject({ data: { artifact: { code: 'PATH_TAKEN' } } });
});

test('a write from a deleted file revives it at the written path and records a put', async () => {
    const original = await publish({ body: 'draft', path: 'haus/revive/draft.md' });
    await remove(original.artifact.artifact_id);
    const before = await state.owner.trpc.drive.changes.query({ serverId: state.serverId });
    const revived = await publish({
        base: original.artifact.revision_id,
        body: 'edited',
        path: 'haus/revive/final.md',
    });
    expect(revived.artifact).toMatchObject({
        artifact_id: original.artifact.artifact_id,
        path: 'haus/revive/final.md',
        revision_number: 2,
    });
    const record = await state.owner.trpc.artifact.get.query({
        artifact_id: original.artifact.artifact_id,
        serverId: state.serverId,
    });
    expect(record.artifact).toMatchObject({
        base_revision_id: original.artifact.revision_id,
        parent_revision_id: original.artifact.revision_id,
        task_id: null,
    });
    const after = await state.owner.trpc.drive.changes.query({
        serverId: state.serverId,
        since: before.until,
    });
    expect(after.changes.map((change) => [change.path, change.change, change.revision_id])).toEqual(
        [['haus/revive/final.md', 'put', revived.artifact.revision_id]]
    );
});

test('retention keeps small replaced revisions for life and purges a deleted file after 30 days', async () => {
    const first = await publish({ body: 'v1', path: 'haus/keep/rules.md' });
    await publish({ base: first.artifact.revision_id, body: 'v2', path: 'haus/keep/rules.md' });
    await state.harness.sql`
        update artifact_revisions set created_at = now() - interval '400 days'
        where artifact_id = ${first.artifact.artifact_id}
    `;
    const gone = await publish({ body: 'old', path: 'haus/keep/gone.md' });
    const recent = await publish({ body: 'recent', path: 'haus/keep/recent.md' });
    await remove(gone.artifact.artifact_id);
    await remove(recent.artifact.artifact_id);
    await state.harness.sql`
        update artifacts set deleted_at = now() - interval '31 days'
        where id = ${gone.artifact.artifact_id}
    `;
    await state.harness.sql`
        update artifacts set deleted_at = now() - interval '29 days'
        where id = ${recent.artifact.artifact_id}
    `;

    const pruned = await deleteExpiredArtifactRevisions(state.connection.db, storage, new Date());

    expect(pruned.map((row) => row.id)).toEqual([gone.artifact.revision_id]);
    expect(await revisionStates(first.artifact.artifact_id)).toEqual(['ready', 'ready']);
    expect(await revisionStates(gone.artifact.artifact_id)).toEqual(['deleted']);
    expect(await revisionStates(recent.artifact.artifact_id)).toEqual(['ready']);
    expect(storage.objects.has(objectKey(gone.artifact))).toBe(false);
    const [tombstone] = await state.harness.sql`
        select change, path from drive_changes where artifact_id = ${gone.artifact.artifact_id}
    `;
    expect(tombstone).toEqual({ change: 'delete', path: 'haus/keep/gone.md' });
    const listed = await state.owner.trpc.artifact.listDeleted.query({
        prefix: 'haus/keep',
        serverId: state.serverId,
    });
    expect(listed.deleted.map((item) => item.artifact.artifact_id)).toEqual([
        recent.artifact.artifact_id,
    ]);
});

async function remove(artifactId: string) {
    expect(
        await state.owner.trpc.artifact.delete.mutate({
            artifact_id: artifactId,
            serverId: state.serverId,
        })
    ).toEqual({ ok: true });
}

async function revisionStates(artifactId: string) {
    const rows = (await state.harness.sql`
        select state from artifact_revisions where artifact_id = ${artifactId}
        order by revision_number
    `) as { state: string }[];
    return rows.map((row) => row.state);
}

function objectKey(artifact: { artifact_id: string; revision_id: string }) {
    return `servers/${state.serverId}/artifacts/${artifact.artifact_id}/${artifact.revision_id}`;
}
