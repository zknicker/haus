import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useArtifacts(
    serverId: string,
    offset: number,
    filters: { query: string; kind: 'all' | 'images' | 'documents' | 'media' | 'other' }
) {
    return hausTrpc.artifact.list.useQuery(
        { offset, serverId, ...filters },
        queryPolicy.syncedSnapshot
    );
}

export function useArtifact(serverId: string, artifact_id: string, revision_id?: string) {
    return hausTrpc.artifact.get.useQuery(
        { artifact_id, revision_id, serverId },
        queryPolicy.syncedSnapshot
    );
}

export function useArtifactVersions(serverId: string, artifact_id: string, offset: number) {
    return hausTrpc.artifact.versions.useQuery(
        { artifact_id, offset, serverId },
        queryPolicy.syncedSnapshot
    );
}

export function useArtifactDownload(serverId: string, artifact_id: string, revision_id: string) {
    return hausTrpc.artifact.download.useQuery(
        { artifact_id, revision_id, serverId },
        { ...queryPolicy.syncedSnapshot, staleTime: 60_000 }
    );
}
