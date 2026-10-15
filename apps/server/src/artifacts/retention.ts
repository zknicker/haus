import { ARTIFACT_REVISION_RETENTION_DAYS } from '@haus/api';
import { and, eq, exists, gt, lt, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactStorage, deleteRevisionObjects } from './storage.ts';

const sweepIntervalMs = 60 * 60 * 1000;
const retentionMs = ARTIFACT_REVISION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Deletes revisions replaced more than the retention window ago: a ready revision goes once a
 * newer ready revision of the same file was published before the window. The current revision
 * is never selected. Rows are claimed as `deleting` in one statement, so a concurrent delete or
 * publish never sees a half-pruned revision; a storage failure leaves the row `deleting` for the
 * startup cleanup (`reconcileArtifacts`) to finish.
 */
export async function deleteExpiredArtifactRevisions(
    db: HausDatabase,
    storage: ArtifactStorage,
    now: Date
) {
    const expiredBefore = new Date(now.getTime() - retentionMs);
    const newer = alias(revisions, 'newer_revision');
    const claimed = await db
        .update(revisions)
        .set({ state: 'deleting' })
        .where(
            and(
                eq(revisions.state, 'ready'),
                exists(
                    db
                        .select({ one: sql`1` })
                        .from(newer)
                        .where(
                            and(
                                eq(newer.serverId, revisions.serverId),
                                eq(newer.artifactId, revisions.artifactId),
                                gt(newer.revisionNumber, revisions.revisionNumber),
                                eq(newer.state, 'ready'),
                                lt(newer.createdAt, expiredBefore)
                            )
                        )
                ),
                notExists(
                    db
                        .select({ one: sql`1` })
                        .from(artifacts)
                        .where(
                            and(
                                eq(artifacts.serverId, revisions.serverId),
                                eq(artifacts.id, revisions.artifactId),
                                eq(artifacts.currentRevisionId, revisions.id)
                            )
                        )
                )
            )
        )
        .returning();
    const deleted: typeof claimed = [];
    const failedRevisionIds: string[] = [];
    for (const row of claimed) {
        try {
            await deleteRevisionObjects(storage, row.objectKey);
            await db.delete(revisions).where(eq(revisions.id, row.id));
            deleted.push(row);
        } catch {
            failedRevisionIds.push(row.id);
        }
    }
    if (failedRevisionIds.length) {
        throw new Error(
            `Artifact revision retention left ${failedRevisionIds.length} revisions pending cleanup.`
        );
    }
    return deleted;
}

/** Runs revision retention on boot and hourly after that; storage-less Servers have nothing to prune. */
export function startArtifactRetentionSweep(
    db: HausDatabase,
    storage: ArtifactStorage,
    clock: { now(): Date },
    timers?: SweepTimers
): BootSweep {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'artifact revision retention sweep',
        run: () => deleteExpiredArtifactRevisions(db, storage, clock.now()),
        timers,
    });
}
