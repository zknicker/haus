import type { ArtifactThumbnailResult } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactRevisionsTable as revisions } from '../postgres/schema.ts';
import type { ArtifactActor } from './access.ts';
import { getArtifact } from './read.ts';
import { type ArtifactStorage, artifactThumbnailKey, requireArtifactStorage } from './storage.ts';
import type { ArtifactThumbnails } from './thumbnails.ts';

/**
 * A revision's thumbnail link, with the same membership authorization as `download`. A raster
 * revision without one yet (published before thumbnails existed, or still rendering after its
 * publish) waits for the render rather than answering `none` and caching the wrong answer.
 */
export async function artifactThumbnail(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    storage: ArtifactStorage | null,
    thumbnails: ArtifactThumbnails | null,
    artifactId: string,
    revisionId: string
): Promise<ArtifactThumbnailResult> {
    const store = requireArtifactStorage(storage);
    const { objectKey } = await getArtifact(db, actor, origin, artifactId, revisionId);
    const [revision] = await db
        .select({
            byteSize: revisions.byteSize,
            contentType: revisions.contentType,
            id: revisions.id,
            objectKey: revisions.objectKey,
            thumbnailState: revisions.thumbnailState,
        })
        .from(revisions)
        .where(eq(revisions.id, revisionId))
        .limit(1);
    if (!(revision && thumbnails && (await thumbnails.ensure(revision)))) {
        return { status: 'none' };
    }
    return {
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        status: 'ready',
        thumbnail_url: store.downloadUrl(artifactThumbnailKey(objectKey)),
    };
}
