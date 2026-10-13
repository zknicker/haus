import { and, eq, gt, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
    serversTable,
} from '../postgres/schema.ts';
import { type ArtifactAccess, type ArtifactActor, artifactAccess } from './access.ts';
import { releasePendingPath } from './publish.ts';
import { ArtifactError, type ArtifactStorage, requireArtifactStorage } from './storage.ts';

export async function deleteArtifact(
    db: HausDatabase,
    actor: ArtifactActor,
    storage: ArtifactStorage | null,
    artifactId: string,
    revisionId?: string
) {
    const store = requireArtifactStorage(storage);
    const access = await artifactAccess(db, actor);
    const keys = await db.transaction(async (tx) => {
        await tx
            .select({ id: serversTable.id })
            .from(serversTable)
            .where(eq(serversTable.id, access.serverId))
            .for('update');
        const [artifact] = await tx
            .select()
            .from(artifacts)
            .where(and(eq(artifacts.serverId, access.serverId), eq(artifacts.id, artifactId)))
            .limit(1);
        if (!artifact || artifact.deletedAt) {
            throw new ArtifactError('Artifact was not found.', 404, 'NOT_FOUND');
        }
        requireDeleteAccess(access, artifact);
        if (revisionId === artifact.currentRevisionId) {
            throw new ArtifactError(
                'Publish a replacement before deleting the current revision.',
                409,
                'CURRENT_REVISION'
            );
        }
        const selected = await tx
            .select()
            .from(revisions)
            .where(
                and(
                    eq(revisions.serverId, access.serverId),
                    eq(revisions.artifactId, artifactId),
                    revisionId ? eq(revisions.id, revisionId) : undefined
                )
            );
        if (revisionId && !selected.some((row) => row.state === 'ready')) {
            throw new ArtifactError('Revision was not found.', 404, 'NOT_FOUND');
        }
        if (selected.some((row) => row.state === 'uploading')) {
            throw new ArtifactError(
                'Wait for active publications to settle before deleting.',
                409,
                'UPLOAD_CONFLICT'
            );
        }
        if (!revisionId) {
            await tx
                .update(artifacts)
                .set({ currentRevisionId: null, deletedAt: new Date() })
                .where(eq(artifacts.id, artifactId));
        }
        const ids = selected.filter((row) => row.state !== 'deleted').map((row) => row.id);
        if (ids.length) {
            await tx.update(revisions).set({ state: 'deleting' }).where(inArray(revisions.id, ids));
        }
        return selected.filter((row) => row.state !== 'deleted');
    });
    for (const row of keys) {
        await purgeRevision(db, store, row);
    }
    return { ok: true };
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

async function purgeRevision(
    db: HausDatabase,
    storage: ArtifactStorage,
    row: typeof revisions.$inferSelect
) {
    await storage.delete(row.objectKey);
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
        await store.delete(row.objectKey);
    }
}

function requireDeleteAccess(access: ArtifactAccess, artifact: typeof artifacts.$inferSelect) {
    if (access.isAdmin) {
        return;
    }
    if (access.agentId !== null && artifact.creatorAgentId === access.agentId) {
        return;
    }
    if (access.userId !== null && artifact.creatorUserId === access.userId) {
        return;
    }
    throw new ArtifactError(
        'Only the original author or a human Owner/Admin can delete this artifact.',
        403,
        'FORBIDDEN'
    );
}
