import type { ArtifactDeleteManyInput, ArtifactDeleteManyResult } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { driveAreaOfPath, mayWriteDriveArea } from '../drive/areas.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactsTable as artifacts } from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { softDeleteArtifacts } from './delete.ts';
import { lockLiveServer } from './move.ts';

/**
 * Deletes every named file the caller may write, in one transaction, and reports the files it
 * left: `forbidden` (in an area the caller may not write) and `missing` (already gone or never
 * here). A file still taking an upload refuses the whole batch, as a single delete would. Deleted
 * files stay restorable, and the batch announces one Files update.
 */
export async function deleteManyArtifacts(
    db: HausDatabase,
    actor: ArtifactActor,
    input: Omit<ArtifactDeleteManyInput, 'serverId'>
): Promise<ArtifactDeleteManyResult> {
    const access = await artifactAccess(db, actor);
    const ids = [...new Set(input.artifact_ids)];
    const result = await db.transaction(async (tx) => {
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
        const placed = [];
        for (const artifact of rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))) {
            placed.push({
                artifact,
                placement: await driveAreaOfPath(tx, access.serverId, artifact.path),
            });
        }
        const allowed = placed.filter((file) => mayWriteDriveArea(access, file.placement.area));
        await softDeleteArtifacts(tx, access.serverId, allowed, access.authorKey);
        const found = new Set(rows.map((row) => row.id));
        return {
            deleted: allowed.map((file) => file.artifact.id),
            forbidden: placed
                .filter((file) => !mayWriteDriveArea(access, file.placement.area))
                .map((file) => file.artifact.id),
            missing: ids.filter((id) => !found.has(id)),
        };
    });
    if (result.deleted.length > 0) {
        artifactUpdatedTopic.announce({ artifactId: null, serverId: access.serverId });
    }
    return result;
}
