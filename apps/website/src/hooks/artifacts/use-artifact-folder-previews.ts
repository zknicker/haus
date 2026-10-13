import type { ArtifactFolderEntry, ArtifactMetadata } from '@haus/api';
import * as React from 'react';
import { artifactFolderPreviews } from '../../features/artifacts/drive-folders.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import type { ArtifactLibraryFilters } from './use-artifact-library.ts';

const previewReadLimit = 200;

/**
 * The few newest files peeking out of each child folder, from one recursive
 * read of the open folder under the same filters, never one read per folder.
 * Folders whose files all fall past that read show their count alone.
 */
export function useArtifactFolderPreviews(
    serverId: string,
    filters: Omit<ArtifactLibraryFilters, 'query'>,
    folders: readonly ArtifactFolderEntry[]
): ReadonlyMap<string, ArtifactMetadata[]> {
    const read = hausTrpc.artifact.list.useQuery(
        {
            ...(filters.creator ? { creator: filters.creator } : {}),
            kind: filters.kind,
            limit: previewReadLimit,
            prefix: filters.folder,
            recursive: true,
            serverId,
        },
        { ...queryPolicy.syncedSnapshot, enabled: folders.length > 0 }
    );
    const artifacts = read.data?.artifacts;
    return React.useMemo(
        () => artifactFolderPreviews(folders, artifacts ?? []),
        [folders, artifacts]
    );
}
