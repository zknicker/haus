import type { ArtifactCreator, ArtifactListInput, ArtifactMetadata } from '@haus/api';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { nextArtifactOffset } from './artifact-pages.ts';

export interface ArtifactLibraryFilters {
    creator: ArtifactCreator | null;
    kind: ArtifactListInput['kind'];
    query: string;
}

/**
 * The Server's shared files for the library, newest revision first, a page at
 * a time (`artifact.list`). A filter change keeps the previous result on
 * screen until the narrowed read lands, so typing a search never blanks it.
 */
export function useArtifactLibrary(serverId: string, filters: ArtifactLibraryFilters) {
    const utils = hausTrpc.useUtils();
    const input = {
        ...(filters.creator ? { creator: filters.creator } : {}),
        kind: filters.kind,
        query: filters.query.trim(),
        serverId,
    };
    const query = useInfiniteQuery({
        ...queryPolicy.syncedSnapshot,
        getNextPageParam: (lastPage: ArtifactMetadata[], pages: ArtifactMetadata[][]) =>
            nextArtifactOffset(lastPage, pages),
        initialPageParam: 0,
        placeholderData: keepPreviousData,
        queryFn: async ({ pageParam }) =>
            (await utils.client.artifact.list.query({ ...input, offset: pageParam })).artifacts,
        queryKey: getQueryKey(hausTrpc.artifact.list, input, 'infinite'),
    });
    const pages = query.data?.pages;
    const artifacts = React.useMemo(() => dedupeArtifacts(pages), [pages]);

    return {
        artifacts: query.data ? artifacts : null,
        error: query.error,
        hasMore: query.hasNextPage,
        isFetchingMore: query.isFetchingNextPage,
        loadMore: () => void query.fetchNextPage(),
    };
}

/** A publish between page reads shifts offsets by one; keep each artifact once. */
function dedupeArtifacts(pages: readonly ArtifactMetadata[][] | undefined): ArtifactMetadata[] {
    const seen = new Set<string>();
    return (pages ?? []).flat().filter((artifact) => {
        if (seen.has(artifact.artifact_id)) {
            return false;
        }
        seen.add(artifact.artifact_id);
        return true;
    });
}
