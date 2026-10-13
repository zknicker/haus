import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One revision's text for the inline preview. Revisions are immutable, so the
 * read never goes stale; switching revisions is a different key.
 */
export function useArtifactText(
    serverId: string,
    artifactId: string,
    revisionId: string,
    options?: { enabled?: boolean }
) {
    return hausTrpc.artifact.text.useQuery(
        { artifact_id: artifactId, revision_id: revisionId, serverId },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: options?.enabled !== false,
            staleTime: Number.POSITIVE_INFINITY,
        }
    );
}
