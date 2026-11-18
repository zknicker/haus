import type { ArtifactThumbnailResult } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
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
    // getArtifact already scoped the revision to the caller's Server and a live file.
    const { revision } = await getArtifact(db, actor, origin, artifactId, revisionId);
    if (!(thumbnails && (await thumbnails.ensure(revision)))) {
        return { status: 'none' };
    }
    return {
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        status: 'ready',
        thumbnail_url: store.downloadUrl(artifactThumbnailKey(revision.objectKey)),
    };
}
