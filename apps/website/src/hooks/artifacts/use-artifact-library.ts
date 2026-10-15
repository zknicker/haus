import type {
    ArtifactCreator,
    ArtifactFolderEntry,
    ArtifactLibraryPage,
    ArtifactListInput,
    ArtifactMetadata,
    ArtifactPublicLink,
} from '@haus/api';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export interface ArtifactLibraryFilters {
    creator: ArtifactCreator | null;
    /** The open drive folder; `''` is the root. */
    folder: string;
    kind: ArtifactListInput['kind'];
    query: string;
}

/**
 * One drive folder for the library (`artifact.list`), newest revision first,
 * a page at a time: its child folders (first page) and its own files. A
 * search reads every file under the folder instead, with no folders. A
 * filter change keeps the previous result on screen until the narrowed read
 * lands, so typing a search never blanks it.
 */
export function useArtifactLibrary(serverId: string, filters: ArtifactLibraryFilters) {
    const utils = hausTrpc.useUtils();
    const query = filters.query.trim();
    const input = {
        ...(filters.creator ? { creator: filters.creator } : {}),
        kind: filters.kind,
        prefix: filters.folder,
        query,
        recursive: query !== '',
        serverId,
    };
    const result = useInfiniteQuery({
        ...queryPolicy.syncedSnapshot,
        getNextPageParam: (lastPage: ArtifactLibraryPage) => lastPage.next_offset ?? undefined,
        initialPageParam: 0,
        placeholderData: keepPreviousData,
        queryFn: async ({ pageParam }) =>
            await utils.client.artifact.list.query({ ...input, offset: pageParam }),
        queryKey: getQueryKey(hausTrpc.artifact.list, input, 'infinite'),
    });
    const pages = result.data?.pages;
    const artifacts = React.useMemo(() => dedupeArtifacts(pages), [pages]);
    const publicLinks = React.useMemo(
        (): Readonly<Record<string, ArtifactPublicLink>> =>
            Object.assign({}, ...(pages ?? []).map((page) => page.public_links)),
        [pages]
    );
    const folders: ArtifactFolderEntry[] = pages?.[0]?.folders ?? [];

    return {
        artifacts: result.data ? artifacts : null,
        error: result.error,
        folders,
        hasMore: result.hasNextPage,
        isFetchingMore: result.isFetchingNextPage,
        loadMore: () => void result.fetchNextPage(),
        /** Public links of the loaded files, keyed by artifact id. */
        publicLinks,
    };
}

export type ArtifactLibrary = ReturnType<typeof useArtifactLibrary>;

/** A publish between page reads shifts offsets by one; keep each artifact once. */
function dedupeArtifacts(pages: readonly ArtifactLibraryPage[] | undefined): ArtifactMetadata[] {
    const seen = new Set<string>();
    return (pages ?? [])
        .flatMap((page) => page.artifacts)
        .filter((artifact) => {
            if (seen.has(artifact.artifact_id)) {
                return false;
            }
            seen.add(artifact.artifact_id);
            return true;
        });
}
