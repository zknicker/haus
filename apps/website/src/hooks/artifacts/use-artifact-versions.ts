import type { ArtifactRecord } from '@haus/api';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { nextArtifactOffset } from './artifact-pages.ts';

/** One artifact's revisions, newest first, a page at a time (`artifact.versions`). */
export function useArtifactVersions(serverId: string, artifactId: string) {
    const utils = hausTrpc.useUtils();
    const input = { artifact_id: artifactId, serverId };
    const query = useInfiniteQuery({
        ...queryPolicy.syncedSnapshot,
        getNextPageParam: (lastPage: ArtifactRecord[], pages: ArtifactRecord[][]) =>
            nextArtifactOffset(lastPage, pages),
        initialPageParam: 0,
        queryFn: async ({ pageParam }) =>
            (await utils.client.artifact.versions.query({ ...input, offset: pageParam })).versions,
        queryKey: getQueryKey(hausTrpc.artifact.versions, input, 'infinite'),
    });
    const pages = query.data?.pages;
    const versions = React.useMemo(() => pages?.flat() ?? null, [pages]);

    return {
        error: query.error,
        hasMore: query.hasNextPage,
        isFetchingMore: query.isFetchingNextPage,
        loadMore: () => void query.fetchNextPage(),
        versions,
    };
}
