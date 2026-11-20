import { type ArtifactRecord, artifactListPageMax } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useDriveFolderFiles(serverId: string, folder: string) {
    const query = hausTrpc.artifact.list.useQuery(
        { limit: artifactListPageMax, order: 'name', prefix: folder, serverId },
        queryPolicy.syncedSnapshot
    );
    const files: ArtifactRecord[] | null = query.data?.artifacts ?? null;
    return { error: query.error, files };
}
