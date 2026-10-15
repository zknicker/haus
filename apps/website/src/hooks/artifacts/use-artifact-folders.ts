import type { ArtifactFolderEntry } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * One drive folder's child folders, for a folder picker (`artifact.list`'s
 * first page carries every child folder, so one file is enough to read).
 * Null until the first read lands.
 */
export function useArtifactFolders(serverId: string, folder: string) {
    const query = hausTrpc.artifact.list.useQuery(
        { limit: 1, prefix: folder, serverId },
        queryPolicy.syncedSnapshot
    );
    const folders: ArtifactFolderEntry[] | null = query.data?.folders ?? null;
    return { error: query.error, folders };
}
