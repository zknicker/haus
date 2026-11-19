import { and, eq, gt, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { type DrivePlacement, driveAreaOfPath, requireDriveWrite } from '../drive/areas.ts';
import { type DriveChangeEntry, recordDriveChanges } from '../drive/changes.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
    serversTable,
} from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { revisionConflict } from './conflict.ts';
import { lockLiveServer } from './move.ts';
import { releasePendingPath } from './publish.ts';
import {
    ArtifactError,
    type ArtifactStorage,
    deleteRevisionObjects,
    requireArtifactStorage,
} from './storage.ts';

type Artifact = typeof artifacts.$inferSelect;

/**
 * Deletes a file the caller may write. The file keeps its head and every revision, restorable
 * until retention purges them. A `baseRevisionId` that is no longer the head leaves the file in
 * place with `REVISION_CONFLICT`, so an edit always beats a delete.
 */
export async function deleteArtifact(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    artifactId: string,
    options: { baseRevisionId?: string } = {}
) {
    const access = await artifactAccess(db, actor);
    await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const artifact = await liveArtifact(tx, access.serverId, artifactId);
        if (options.baseRevisionId && options.baseRevisionId !== artifact.currentRevisionId) {
            throw await revisionConflict(tx, access, origin, {
                artifactId: artifact.id,
                baseRevisionId: options.baseRevisionId,
                path: artifact.path,
            });
        }
        const placement = requireDriveWrite(
            access,
            await driveAreaOfPath(tx, access.serverId, artifact.path)
        );
        await softDeleteArtifacts(tx, access.serverId, [{ artifact, placement }]);
    });
    artifactUpdatedTopic.announce({ artifactId, serverId: access.serverId });
    return { ok: true };
}

/** Purges one replaced revision of a live file at once; the head is never purged this way. */
export async function deleteArtifactVersion(
    db: HausDatabase,
    actor: ArtifactActor,
    storage: ArtifactStorage | null,
    artifactId: string,
    revisionId: string
) {
    const store = requireArtifactStorage(storage);
    const access = await artifactAccess(db, actor);
    const revision = await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const artifact = await liveArtifact(tx, access.serverId, artifactId);
        requireDriveWrite(access, await driveAreaOfPath(tx, access.serverId, artifact.path));
        if (revisionId === artifact.currentRevisionId) {
            throw new ArtifactError(
                'Publish a replacement before deleting the current revision.',
                409,
                'CURRENT_REVISION'
            );
        }
        const [row] = await tx
            .select()
            .from(revisions)
            .where(
                and(
                    eq(revisions.serverId, access.serverId),
                    eq(revisions.artifactId, artifactId),
                    eq(revisions.id, revisionId),
                    eq(revisions.state, 'ready')
                )
            );
        if (!row) {
            throw new ArtifactError('Revision was not found.', 404, 'NOT_FOUND');
        }
        await tx.update(revisions).set({ state: 'deleting' }).where(eq(revisions.id, row.id));
        return { ...row, state: 'deleting' as const };
    });
    artifactUpdatedTopic.announce({ artifactId, serverId: access.serverId });
    await purgeRevision(db, store, revision);
    return { ok: true };
}

/**
 * Marks live files deleted, keeping each head, and records one delete per published file. A file
 * still taking an upload refuses the whole set. Call under the Server row lock.
 */
export async function softDeleteArtifacts(
    tx: HausDatabase,
    serverId: string,
    files: readonly { artifact: Artifact; placement: DrivePlacement }[]
) {
    if (files.length === 0) {
        return;
    }
    const ids = files.map((file) => file.artifact.id);
    const [uploading] = await tx
        .select({ id: revisions.id })
        .from(revisions)
        .where(
            and(
                eq(revisions.serverId, serverId),
                inArray(revisions.artifactId, ids),
                eq(revisions.state, 'uploading')
            )
        )
        .limit(1);
    if (uploading) {
        throw new ArtifactError(
            'Wait for active publications to settle before deleting.',
            409,
            'UPLOAD_CONFLICT'
        );
    }
    // A restore must not quietly re-expose a public link the delete killed.
    await tx
        .update(artifacts)
        .set({
            deletedAt: new Date(),
            publicLinkCreatedAt: null,
            publicLinkCreatorAgentId: null,
            publicLinkCreatorUserId: null,
            publicToken: null,
        })
        .where(inArray(artifacts.id, ids));
    await recordDriveChanges(
        tx,
        serverId,
        files.flatMap(({ artifact, placement }): DriveChangeEntry[] =>
            artifact.currentRevisionId
                ? [
                      {
                          area: placement.area,
                          artifactId: artifact.id,
                          change: 'delete',
                          path: artifact.path,
                      },
                  ]
                : []
        )
    );
}

export async function reconcileArtifacts(db: HausDatabase, storage: ArtifactStorage | null) {
    const failedRevisionIds: string[] = [];
    if (!storage) {
        return { failedRevisionIds };
    }
    const rows = await db
        .select()
        .from(revisions)
        .where(
            or(
                inArray(revisions.state, ['uploading', 'deleting']),
                and(eq(revisions.state, 'failed'), gt(revisions.reservedBytes, 0))
            )
        );
    for (const row of rows) {
        try {
            await purgeRevision(db, storage, row);
            if (row.state === 'uploading') {
                await releasePendingPath(db, row.artifactId);
            }
        } catch {
            failedRevisionIds.push(row.id);
        }
    }
    return { failedRevisionIds };
}

export async function purgeRevision(
    db: HausDatabase,
    storage: ArtifactStorage,
    row: typeof revisions.$inferSelect
) {
    await deleteRevisionObjects(storage, row.objectKey);
    await db
        .update(revisions)
        .set({ reservedBytes: 0, state: row.state === 'deleting' ? 'deleted' : 'failed' })
        .where(eq(revisions.id, row.id));
}

export async function purgeServerArtifacts(
    db: HausDatabase,
    storage: ArtifactStorage | null,
    serverId: string
) {
    const [deletedServer] = await db
        .select({ id: serversTable.id })
        .from(serversTable)
        .where(and(eq(serversTable.id, serverId), isNotNull(serversTable.deletedAt)))
        .limit(1);
    if (!deletedServer) {
        return;
    }
    const rows = await db
        .select()
        .from(revisions)
        .where(and(eq(revisions.serverId, serverId), sql`${revisions.state} <> 'deleted'`));
    if (!rows.length) {
        return;
    }
    const store = requireArtifactStorage(storage);
    for (const row of rows) {
        await deleteRevisionObjects(store, row.objectKey);
    }
}

async function liveArtifact(tx: HausDatabase, serverId: string, artifactId: string) {
    const [artifact] = await tx
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.serverId, serverId), eq(artifacts.id, artifactId)))
        .limit(1);
    if (!artifact || artifact.deletedAt) {
        throw new ArtifactError('File was not found.', 404, 'NOT_FOUND');
    }
    return artifact;
}
