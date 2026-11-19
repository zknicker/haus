import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { liveArtifactAtPath } from './path.ts';
import { publishArtifact } from './publish.ts';
import { getArtifact, hasDefaultTitle } from './read.ts';
import { ArtifactError, type ArtifactStorage, requireArtifactStorage } from './storage.ts';
import type { ArtifactThumbnails } from './thumbnails.ts';

/**
 * Restores a revision by publishing its bytes, title, and content type as a new revision on top
 * of the head, so history only ever grows. A deleted file comes back at its last path this way,
 * on top of its last head. The head guard makes a restore that races another write fail with
 * `REVISION_CONFLICT` instead of silently overwriting it.
 */
export async function restoreArtifactRevision(options: {
    actor: ArtifactActor;
    artifactId: string;
    budget: number;
    db: HausDatabase;
    origin: string;
    revisionId: string;
    storage: ArtifactStorage | null;
    thumbnails: ArtifactThumbnails | null;
}) {
    const { actor, artifactId, db, origin, revisionId } = options;
    const storage = requireArtifactStorage(options.storage);
    const { serverId } = await artifactAccess(db, actor);
    const { artifact, revision } = await restorableRevision(db, serverId, artifactId, revisionId);
    if (!artifact.deletedAt && artifact.currentRevisionId === revisionId) {
        throw new ArtifactError(
            'That revision is already the current one.',
            409,
            'CURRENT_REVISION'
        );
    }
    if (artifact.deletedAt && (await liveArtifactAtPath(db, serverId, artifact.path))) {
        throw new ArtifactError(
            `Another file lives at \`${artifact.path}\` now. Move it away, then restore.`,
            409,
            'PATH_TAKEN'
        );
    }
    const published = await publishArtifact({
        actor,
        budget: options.budget,
        db,
        input: {
            base_revision_id: artifact.currentRevisionId ?? undefined,
            content_type: revision.contentType,
            path: artifact.path,
            replace: false,
            request_id: createOpaqueId('rst'),
            // A default title is the file's name, so the restored revision takes today's name.
            ...(hasDefaultTitle(revision) ? {} : { title: revision.title }),
        },
        merges: false,
        origin,
        storage,
        stream: chunksOf(storage.stream(revision.objectKey)),
        thumbnails: options.thumbnails,
    });
    return (await getArtifact(db, actor, origin, artifactId, published.artifact.revision_id))
        .record;
}

/** A ready revision of a live file, or of a deleted file that still has a head to build on. */
async function restorableRevision(
    db: HausDatabase,
    serverId: string,
    artifactId: string,
    revisionId: string
) {
    const [row] = await db
        .select({ artifact: artifacts, revision: revisions })
        .from(artifacts)
        .innerJoin(
            revisions,
            and(eq(revisions.serverId, artifacts.serverId), eq(revisions.artifactId, artifacts.id))
        )
        .where(
            and(
                eq(artifacts.serverId, serverId),
                eq(artifacts.id, artifactId),
                eq(revisions.id, revisionId),
                eq(revisions.state, 'ready')
            )
        )
        .limit(1);
    if (!row?.artifact.currentRevisionId) {
        throw new ArtifactError('File or revision was not found.', 404, 'NOT_FOUND');
    }
    return row;
}

/** The stored bytes as the publish path reads them; an abandoned read is collected with the stream. */
async function* chunksOf(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
        yield read.value;
    }
}
