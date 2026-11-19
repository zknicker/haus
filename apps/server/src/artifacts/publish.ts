import { createHash } from 'node:crypto';
import type { ArtifactPublishInput } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { landArtifactRevision } from './land.ts';
import { getArtifact } from './read.ts';
import { type ArtifactReservation, reserveArtifact } from './reserve.ts';
import {
    ArtifactError,
    type ArtifactStorage,
    artifactMaxBytes,
    artifactStorageBytes,
    requireArtifactStorage,
} from './storage.ts';
import type { ArtifactThumbnails } from './thumbnails.ts';

export interface ArtifactPublishOptions {
    db: HausDatabase;
    actor: ArtifactActor;
    origin: string;
    storage: ArtifactStorage | null;
    budget?: number;
    input: ArtifactPublishInput;
    stream: AsyncIterable<Uint8Array>;
    /** The Task the write was for; only a push names one. */
    taskId?: string | null;
    /** Renders the new revision's thumbnail after it lands; never fails the publish. */
    thumbnails?: ArtifactThumbnails | null;
}

export async function publishArtifact(options: ArtifactPublishOptions) {
    const { db, actor, input, origin } = options;
    const storage = requireArtifactStorage(options.storage);
    const access = await artifactAccess(db, actor);
    const reserved = await reserveArtifact(
        db,
        access,
        { input, taskId: options.taskId ?? null },
        options.budget ?? artifactStorageBytes,
        origin
    );
    if (reserved.retry) {
        await requireSameBytes(reserved.revision, options.stream);
    } else {
        const uploaded = await upload(options, access, reserved, storage);
        // Committed: nothing below may fail the publish or reach the upload's cleanup.
        artifactUpdatedTopic.announce({
            artifactId: reserved.artifact.id,
            serverId: access.serverId,
        });
        void options.thumbnails?.ensure({
            byteSize: uploaded.size,
            contentType: input.content_type,
            id: reserved.revision.id,
            objectKey: reserved.revision.objectKey,
            thumbnailState: null,
        });
    }
    return {
        artifact: (await getArtifact(db, actor, origin, reserved.artifact.id, reserved.revision.id))
            .metadata,
    };
}

async function upload(
    options: ArtifactPublishOptions,
    access: Awaited<ReturnType<typeof artifactAccess>>,
    reserved: Extract<ArtifactReservation, { retry: false }>,
    storage: ArtifactStorage
) {
    const { db, input } = options;
    try {
        const uploaded = await storage.upload(
            reserved.revision.objectKey,
            options.stream,
            input.content_type
        );
        if (uploaded.size > artifactMaxBytes) {
            throw new ArtifactError('File exceeds the 256 MiB limit.', 413, 'SIZE_LIMIT');
        }
        await landArtifactRevision(db, access, options.origin, {
            artifactId: reserved.artifact.id,
            expect: reserved.expect,
            revision: reserved.revision,
            uploaded,
        });
        return uploaded;
    } catch (cause) {
        await db
            .update(revisions)
            .set({ state: 'failed' })
            .where(eq(revisions.id, reserved.revision.id));
        await releasePendingPath(db, reserved.artifact.id);
        try {
            await storage.delete(reserved.revision.objectKey);
            await db
                .update(revisions)
                .set({ reservedBytes: 0 })
                .where(eq(revisions.id, reserved.revision.id));
        } catch (cleanupCause) {
            throw new AggregateError(
                [cause, cleanupCause],
                'Artifact upload failed and cleanup remains pending.'
            );
        }
        throw cause;
    }
}

/** A retry must resend the bytes the writer first sent, which a merged revision no longer holds. */
async function requireSameBytes(
    revision: typeof revisions.$inferSelect,
    stream: AsyncIterable<Uint8Array>
) {
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.byteLength;
        if (size > artifactMaxBytes) {
            throw new ArtifactError('File exceeds the 256 MiB limit.', 413, 'SIZE_LIMIT');
        }
        hash.update(chunk);
    }
    if (hash.digest('hex') !== (revision.requestSha256 ?? revision.sha256)) {
        throw new ArtifactError(
            'That request_id was published with different bytes.',
            409,
            'IDEMPOTENCY_KEY_REUSED'
        );
    }
}

/** A create whose only upload failed never existed: free its path for the next writer. */
export async function releasePendingPath(db: HausDatabase, artifactId: string) {
    await db
        .update(artifacts)
        .set({ deletedAt: new Date() })
        .where(
            and(
                eq(artifacts.id, artifactId),
                isNull(artifacts.currentRevisionId),
                isNull(artifacts.deletedAt),
                sql`not exists (select 1 from ${revisions} where ${revisions.artifactId} = ${artifacts.id} and ${revisions.state} = 'uploading')`
            )
        );
}
