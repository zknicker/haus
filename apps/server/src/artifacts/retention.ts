import {
    ARTIFACT_REVISION_RETENTION_DAYS,
    artifactTextMaxBytes,
    driveDeletedRetentionDays,
} from '@haus/api';
import { and, eq, exists, gt, inArray, lt, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactStorage, deleteRevisionObjects } from './storage.ts';

/** Revisions one claim takes; a backlog (the first sweep after deploy) drains batch by batch. */
export const ARTIFACT_RETENTION_BATCH_SIZE = 200;

const sweepIntervalMs = 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const replacedRetentionMs = ARTIFACT_REVISION_RETENTION_DAYS * dayMs;
const deletedRetentionMs = driveDeletedRetentionDays * dayMs;

type Revision = typeof revisions.$inferSelect;

/**
 * Prunes what retention lets go. A replaced revision larger than `artifactTextMaxBytes` goes once
 * a newer ready revision of the same file was created before the replaced window; smaller ones
 * stay for the life of the file. A file deleted before the deleted window loses every revision,
 * while its row and change tombstone stay. A live file's current revision is never selected. A
 * pruned revision ends exactly like a deleted one (`deleted`, no reserved bytes), so its row
 * still answers request_id retries and conflict lookups.
 *
 * Revisions are claimed as `deleting` in bounded batches (`skip locked`, so two Servers sharing
 * the database never contend), and `closing` is checked between revisions: an aborted run hands
 * its unprocessed claims back as `ready`. A storage failure leaves the row `deleting` for the
 * startup cleanup (`reconcileArtifacts`) to finish. Each affected Server hears one broad event.
 */
export async function deleteExpiredArtifactRevisions(
    db: HausDatabase,
    storage: ArtifactStorage,
    now: Date,
    options: { batchSize?: number; closing?: AbortSignal } = {}
) {
    const batchSize = options.batchSize ?? ARTIFACT_RETENTION_BATCH_SIZE;
    const deleted: Revision[] = [];
    const failedRevisionIds: string[] = [];
    const touchedServerIds = new Set<string>();
    try {
        while (!options.closing?.aborted) {
            const claimed = await claimExpiredRevisions(db, now, batchSize);
            for (const [index, row] of claimed.entries()) {
                if (options.closing?.aborted) {
                    await releaseClaims(db, claimed.slice(index));
                    break;
                }
                touchedServerIds.add(row.serverId);
                try {
                    await deleteRevisionObjects(storage, row.objectKey);
                    await db
                        .update(revisions)
                        .set({ reservedBytes: 0, state: 'deleted' })
                        .where(eq(revisions.id, row.id));
                    deleted.push(row);
                } catch {
                    failedRevisionIds.push(row.id);
                }
            }
            if (claimed.length < batchSize) {
                break;
            }
        }
    } finally {
        // A claim hides its revision, so a Server changed even when its storage delete failed.
        for (const serverId of touchedServerIds) {
            artifactUpdatedTopic.announce({ artifactId: null, serverId });
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
        run: (closing) => deleteExpiredArtifactRevisions(db, storage, clock.now(), { closing }),
        timers,
    });
}

function claimExpiredRevisions(db: HausDatabase, now: Date, batchSize: number) {
    const expired = db
        .select({ id: revisions.id })
        .from(revisions)
        .where(
            and(
                eq(revisions.state, 'ready'),
                or(replacedLargeRevision(db, now), revisionOfLongDeletedFile(db, now))
            )
        )
        .orderBy(revisions.createdAt)
        .limit(batchSize)
        .for('update', { skipLocked: true });
    return db
        .update(revisions)
        .set({ state: 'deleting' })
        .where(and(inArray(revisions.id, expired), eq(revisions.state, 'ready')))
        .returning();
}

/** Larger than text: a newer ready revision replaced it before the window, and it is not the head. */
function replacedLargeRevision(db: HausDatabase, now: Date) {
    const newer = alias(revisions, 'newer_revision');
    return and(
        gt(revisions.byteSize, artifactTextMaxBytes),
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
                        lt(newer.createdAt, new Date(now.getTime() - replacedRetentionMs))
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
    );
}

/** Every revision of a file deleted before the deleted-file window, its last head included. */
function revisionOfLongDeletedFile(db: HausDatabase, now: Date) {
    return exists(
        db
            .select({ one: sql`1` })
            .from(artifacts)
            .where(
                and(
                    eq(artifacts.serverId, revisions.serverId),
                    eq(artifacts.id, revisions.artifactId),
                    lt(artifacts.deletedAt, new Date(now.getTime() - deletedRetentionMs))
                )
            )
    );
}

async function releaseClaims(db: HausDatabase, rows: readonly Revision[]) {
    await db
        .update(revisions)
        .set({ state: 'ready' })
        .where(
            and(
                inArray(
                    revisions.id,
                    rows.map((row) => row.id)
                ),
                eq(revisions.state, 'deleting')
            )
        );
}
