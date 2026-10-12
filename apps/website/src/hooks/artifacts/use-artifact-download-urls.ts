import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Signed URLs for a few revisions at once (a folder's peeking previews),
 * sharing the cache entries `useArtifactDownload` reads. Undefined until each
 * one resolves.
 */
export function useArtifactDownloadUrls(
    serverId: string,
    targets: readonly { artifactId: string; revisionId: string }[]
): (string | undefined)[] {
    const queries = hausTrpc.useQueries((t) =>
        targets.map((target) =>
            t.artifact.download(
                { artifact_id: target.artifactId, revision_id: target.revisionId, serverId },
                { ...queryPolicy.syncedSnapshot, staleTime: 60_000 }
            )
        )
    );
    return queries.map((query) => query.data?.download_url);
}
