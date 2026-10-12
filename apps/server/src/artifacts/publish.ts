import { createHash } from 'node:crypto';
import type { ArtifactPublishInput } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
    serversTable,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { getArtifact } from './read.ts';
import { reserveArtifact } from './reserve.ts';
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
        options.budget ?? artifactStorageBytes
    );
    if (reserved.retry) {
        const hash = createHash('sha256');
        let size = 0;
        for await (const chunk of options.stream) {
            size += chunk.byteLength;
            if (size > artifactMaxBytes) {
                throw new ArtifactError('Artifact exceeds the 256 MiB limit.', 413, 'SIZE_LIMIT');
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
                throw new ArtifactError('Artifact exceeds the 256 MiB limit.', 413, 'SIZE_LIMIT');
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
                    throw new ArtifactError(
                        'Artifact was deleted during publication.',
                        409,
                        'DELETED'
                    );
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
                const [current] = artifact.currentRevisionId
                    ? await tx
                          .select({ number: revisions.revisionNumber })
                          .from(revisions)
                          .where(eq(revisions.id, artifact.currentRevisionId))
                    : [];
                if (!current || current.number < reserved.revision.revisionNumber) {
                    await tx
                        .update(artifacts)
                        .set({ currentRevisionId: reserved.revision.id })
                        .where(eq(artifacts.id, artifact.id));
                }
            });
        } catch (cause) {
            await db
                .update(revisions)
                .set({ state: 'failed' })
                .where(eq(revisions.id, reserved.revision.id));
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
