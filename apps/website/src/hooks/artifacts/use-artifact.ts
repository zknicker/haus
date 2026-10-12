import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** One artifact's metadata: its current revision, or `revisionId` when pinned. */
export function useArtifact(serverId: string, artifactId: string, revisionId?: string) {
    return hausTrpc.artifact.get.useQuery(
        { artifact_id: artifactId, revision_id: revisionId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: serverId !== '' }
    );
}
