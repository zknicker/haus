import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import type { ArtifactActor } from './access.ts';
import { publishArtifact } from './publish.ts';
import { getArtifact } from './read.ts';
import { ArtifactError, type ArtifactStorage, requireArtifactStorage } from './storage.ts';
import type { ArtifactThumbnails } from './thumbnails.ts';

/**
 * Restores an older revision by publishing its bytes, title, and content type as a new revision
 * on top of the current head, so history only ever grows. The head guard makes a restore that
 * races another write fail with `REVISION_CONFLICT` instead of silently overwriting it.
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
    const current = await getArtifact(db, actor, origin, artifactId);
    if (current.metadata.revision_id === revisionId) {
        throw new ArtifactError(
            'That revision is already the current one.',
            409,
            'CURRENT_REVISION'
        );
    }
    const old = await getArtifact(db, actor, origin, artifactId, revisionId);
    const published = await publishArtifact({
        actor,
        budget: options.budget,
        db,
        input: {
            base_revision_id: current.metadata.revision_id,
            content_type: old.metadata.content_type,
            path: current.metadata.path,
            replace: false,
            request_id: createOpaqueId('rst'),
            title: old.metadata.title,
        },
        origin,
        storage,
        stream: storage.stream(old.objectKey),
        thumbnails: options.thumbnails,
    });
    return (await getArtifact(db, actor, origin, artifactId, published.artifact.revision_id))
        .record;
}
