import type { ArtifactDeleteManyInput, ArtifactDeleteManyResult } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { mayDeleteArtifact, purgeRevision } from './delete.ts';
import { lockLiveServer } from './move.ts';
import { ArtifactError, type ArtifactStorage, requireArtifactStorage } from './storage.ts';

/**
 * Deletes every named file the caller may delete, in one transaction, and reports the files it
 * left: `forbidden` (another author's, for a non-admin) and `missing` (already gone or never
 * here). A file still taking an upload refuses the whole batch, as a single delete would. Storage
 * objects are purged after the commit, and the batch announces one Files update.
 */
export async function deleteManyArtifacts(
    db: HausDatabase,
    actor: ArtifactActor,
    storage: ArtifactStorage | null,
    input: Omit<ArtifactDeleteManyInput, 'serverId'>
): Promise<ArtifactDeleteManyResult> {
    const store = requireArtifactStorage(storage);
    const access = await artifactAccess(db, actor);
    const ids = [...new Set(input.artifact_ids)];
    const outcome = await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const rows = await tx
            .select()
            .from(artifacts)
            .where(
                and(
                    eq(artifacts.serverId, access.serverId),
                    inArray(artifacts.id, ids),
                    isNull(artifacts.deletedAt)
                )
            );
        const allowed = rows.filter((row) => mayDeleteArtifact(access, row));
        const deleted = allowed.map((row) => row.id);
        const forbidden = rows
            .filter((row) => !mayDeleteArtifact(access, row))
            .map((row) => row.id);
        const found = new Set(rows.map((row) => row.id));
        const missing = ids.filter((id) => !found.has(id));
        if (deleted.length === 0) {
            return { purge: [], result: { deleted, forbidden, missing } };
        }
        const selected = await tx
            .select()
            .from(revisions)
            .where(
                and(eq(revisions.serverId, access.serverId), inArray(revisions.artifactId, deleted))
            );
        if (selected.some((row) => row.state === 'uploading')) {
            throw new ArtifactError(
                'Wait for active publications to settle before deleting.',
                409,
                'UPLOAD_CONFLICT'
            );
        }
        await tx
            .update(artifacts)
            .set({ currentRevisionId: null, deletedAt: new Date() })
            .where(inArray(artifacts.id, deleted));
        const purge = selected.filter((row) => row.state !== 'deleted');
        if (purge.length) {
            await tx
                .update(revisions)
                .set({ state: 'deleting' })
                .where(
                    inArray(
                        revisions.id,
                        purge.map((row) => row.id)
                    )
                );
        }
        return { purge, result: { deleted, forbidden, missing } };
    });
    if (outcome.result.deleted.length > 0) {
        artifactUpdatedTopic.announce({ artifactId: null, serverId: access.serverId });
    }
    for (const row of outcome.purge) {
        try {
            await purgeRevision(db, store, { ...row, state: 'deleting' });
        } catch {
            // The delete committed; the row stays `deleting` and Server startup retries the purge.
        }
    }
    return outcome.result;
}
