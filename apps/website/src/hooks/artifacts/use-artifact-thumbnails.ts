import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

// A first read can wait for the Server to render the thumbnail: its own HTTP request, so it
// never holds the batch carrying the folder listing.
const unbatched = { context: { skipBatch: true } };

export interface ArtifactThumbnailTarget {
    artifactId: string;
    revisionId: string;
}

/**
 * Signed WebP thumbnail links for raster revisions, never their originals. Each link expires
 * after five minutes, so the read goes stale after one, like `useArtifactDownload`. Undefined
 * while a thumbnail renders or loads, and for revisions without one.
 */
export function useArtifactThumbnailUrls(
    serverId: string,
    targets: readonly ArtifactThumbnailTarget[]
): (string | undefined)[] {
    const queries = hausTrpc.useQueries((t) =>
        targets.map((target) =>
            t.artifact.thumbnail(
                { artifact_id: target.artifactId, revision_id: target.revisionId, serverId },
                { ...queryPolicy.syncedSnapshot, staleTime: 60_000, trpc: unbatched }
            )
        )
    );
    return queries.map((query) =>
        query.data?.status === 'ready' ? query.data.thumbnail_url : undefined
    );
}

/** One revision's thumbnail link; `enabled: false` for files that have none. */
export function useArtifactThumbnailUrl(
    serverId: string,
    target: ArtifactThumbnailTarget,
    options: { enabled: boolean }
): string | undefined {
    const query = hausTrpc.artifact.thumbnail.useQuery(
        { artifact_id: target.artifactId, revision_id: target.revisionId, serverId },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: options.enabled,
            staleTime: 60_000,
            trpc: unbatched,
        }
    );
    return query.data?.status === 'ready' ? query.data.thumbnail_url : undefined;
}
