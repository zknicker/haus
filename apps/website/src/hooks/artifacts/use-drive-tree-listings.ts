import { type ArtifactListResult, artifactListPageMax, artifactPathKey } from '@haus/api';
import { keepPreviousData } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useDriveTreeListings(serverId: string, folders: readonly string[]) {
    const queries = hausTrpc.useQueries((t) =>
        folders.map((prefix) =>
            t.artifact.list(
                { limit: artifactListPageMax, order: 'name', prefix, serverId },
                queryPolicy.syncedSnapshot
            )
        )
    );
    const listings = new Map<string, ArtifactListResult>();
    folders.forEach((folder, index) => {
        const data = queries[index]?.data;
        if (data) {
            listings.set(artifactPathKey(folder), data);
        }
    });
    return { error: queries.find((query) => query.error)?.error ?? null, listings };
}

export function useDriveTreeSearch(serverId: string, root: string, query: string) {
    const trimmed = query.trim();
    const result = hausTrpc.artifact.list.useQuery(
        {
            limit: artifactListPageMax,
            order: 'path',
            prefix: root,
            query: trimmed,
            recursive: true,
            serverId,
        },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: trimmed !== '',
            placeholderData: keepPreviousData,
        }
    );
    return {
        artifacts: trimmed !== '' && result.data ? result.data.artifacts : null,
        error: trimmed === '' ? null : result.error,
    };
}
