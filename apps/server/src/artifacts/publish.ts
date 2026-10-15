import { createHash } from 'node:crypto';
import type { ArtifactPublishInput } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
    serversTable,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { revisionConflict } from './conflict.ts';
import { getArtifact } from './read.ts';
import { type ArtifactWriteExpectation, reserveArtifact } from './reserve.ts';
import {
    ArtifactError,
    type ArtifactStorage,
    artifactMaxBytes,
    artifactStorageBytes,
    requireArtifactStorage,
} from './storage.ts';

export async function publishArtifact(options: {
    db: HausDatabase;
    actor: ArtifactActor;
    origin: string;
    storage: ArtifactStorage | null;
    budget?: number;
    input: ArtifactPublishInput;
    stream: AsyncIterable<Uint8Array>;
}) {
    const { db, actor, input, origin } = options;
    const storage = requireArtifactStorage(options.storage);
    const access = await artifactAccess(db, actor);
    const reserved = await reserveArtifact(
        db,
        access,
        input,
        options.budget ?? artifactStorageBytes,
        origin
    );
    if (reserved.retry) {
        const hash = createHash('sha256');
        let size = 0;
        for await (const chunk of options.stream) {
            size += chunk.byteLength;
            if (size > artifactMaxBytes) {
                throw new ArtifactError('File exceeds the 256 MiB limit.', 413, 'SIZE_LIMIT');
            }
            hash.update(chunk);
        }
        if (
            size !== reserved.revision.byteSize ||
            hash.digest('hex') !== reserved.revision.sha256
        ) {
            throw new ArtifactError(
                'That request_id was published with different bytes.',
                409,
                'IDEMPOTENCY_KEY_REUSED'
            );
        }
    } else {
        try {
            const uploaded = await storage.upload(
                reserved.revision.objectKey,
                options.stream,
                input.content_type
            );
            if (uploaded.size > artifactMaxBytes) {
                throw new ArtifactError('File exceeds the 256 MiB limit.', 413, 'SIZE_LIMIT');
            }
            await db.transaction(async (tx) => {
                const [server] = await tx
                    .select({ id: serversTable.id })
                    .from(serversTable)
                    .where(
                        and(eq(serversTable.id, access.serverId), isNull(serversTable.deletedAt))
                    )
                    .for('update');
                const [artifact] = await tx
                    .select()
                    .from(artifacts)
                    .where(and(eq(artifacts.id, reserved.artifact.id), isNull(artifacts.deletedAt)))
                    .limit(1);
                if (!(server && artifact)) {
                    throw new ArtifactError('File was deleted during publication.', 409, 'DELETED');
                }
                await tx
                    .update(revisions)
                    .set({
                        byteSize: uploaded.size,
                        reservedBytes: uploaded.size,
                        sha256: uploaded.sha256,
                        state: 'ready',
                    })
                    .where(eq(revisions.id, reserved.revision.id));
                await advanceHead(tx, artifact, reserved.revision, reserved.expect, () =>
                    revisionConflict(tx, access, origin, {
                        artifactId: artifact.id,
                        baseRevisionId: reserved.expect.replace ? null : reserved.expect.base,
                        path: artifact.path,
                    })
                );
            });
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
    return {
        artifact: (await getArtifact(db, actor, origin, reserved.artifact.id, reserved.revision.id))
            .metadata,
    };
}

/**
 * Points the artifact at the landed revision. `replace` advances unless a newer revision already
 * landed; otherwise the head must still be the expected base, or the write lost the race.
 */
async function advanceHead(
    tx: HausDatabase,
    artifact: typeof artifacts.$inferSelect,
    revision: typeof revisions.$inferSelect,
    expect: ArtifactWriteExpectation,
    conflict: () => Promise<ArtifactError>
) {
    if (!expect.replace && artifact.currentRevisionId !== expect.base) {
        throw await conflict();
    }
    const [current] = artifact.currentRevisionId
        ? await tx
              .select({ number: revisions.revisionNumber })
              .from(revisions)
              .where(eq(revisions.id, artifact.currentRevisionId))
        : [];
    if (!current || current.number < revision.revisionNumber) {
        await tx
            .update(artifacts)
            .set({ currentRevisionId: revision.id })
            .where(eq(artifacts.id, artifact.id));
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
