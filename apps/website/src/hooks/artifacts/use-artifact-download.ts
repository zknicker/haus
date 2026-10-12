import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * A signed download URL for one revision. Links expire after five minutes, so
 * the read goes stale after one; opening a file refetches a fresh one.
 */
export function useArtifactDownload(
    serverId: string,
    artifactId: string,
    revisionId: string,
    options?: { enabled?: boolean }
) {
    return hausTrpc.artifact.download.useQuery(
        { artifact_id: artifactId, revision_id: revisionId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: options?.enabled !== false, staleTime: 60_000 }
    );
}
