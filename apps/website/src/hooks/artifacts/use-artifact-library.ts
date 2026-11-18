import type {
    ArtifactCreator,
    ArtifactFolderEntry,
    ArtifactLibraryPage,
    ArtifactListInput,
    ArtifactPublicLink,
    ArtifactRecord,
} from '@haus/api';
import { type QueryKey, useInfiniteQuery } from '@tanstack/react-query';
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
    /** The list order (`librarySortOrder`); folders sort on the client. */
    sort: Pick<ArtifactListInput, 'direction' | 'order'>;
}

/**
 * One drive folder for the library (`artifact.list`) in the viewer's sort, a
 * page at a time: its child folders (first page) and its own files. A search
 * reads every file under the folder instead, plus the folders whose name
 * matches. A filter change keeps the previous result on screen until the
 * narrowed read lands, so typing a search never blanks it; opening another
 * folder does not.
 */
export function useArtifactLibrary(
    serverId: string,
    filters: ArtifactLibraryFilters,
    options: { enabled?: boolean } = {}
) {
    const utils = hausTrpc.useUtils();
    const query = filters.query.trim();
    const input = {
        ...(filters.creator ? { creator: filters.creator } : {}),
        kind: filters.kind,
        direction: filters.sort.direction,
        order: filters.sort.order,
        prefix: filters.folder,
        query,
        recursive: query !== '',
        serverId,
    };
    const result = useInfiniteQuery({
        ...queryPolicy.syncedSnapshot,
        enabled: options.enabled ?? true,
        getNextPageParam: (lastPage: ArtifactLibraryPage) => lastPage.next_offset ?? undefined,
        initialPageParam: 0,
        // Only a filter, search, or sort change keeps the last result up; another folder's
        // contents never stand in under this folder's trail.
        placeholderData: (previous, previousQuery) =>
            previousQuery && listedPrefix(previousQuery.queryKey) === input.prefix
                ? previous
                : undefined,
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
        /** Loads further pages until every file is loaded or `limit` files are (Command-A). */
        loadAll: async (limit: number) => {
            let current = result;
            while (current.hasNextPage && dedupeArtifacts(current.data?.pages).length < limit) {
                current = await current.fetchNextPage();
                if (current.isError) {
                    return;
                }
            }
        },
        loadMore: () => void result.fetchNextPage(),
        /** Public links of the loaded files, keyed by artifact id. */
        publicLinks,
    };
}

export type ArtifactLibrary = ReturnType<typeof useArtifactLibrary>;

/** The folder a cached `artifact.list` read listed (tRPC keys hold `[path, { input }]`). */
function listedPrefix(key: QueryKey): string | undefined {
    const input = (key[1] as { input?: { prefix?: unknown } } | undefined)?.input;
    return typeof input?.prefix === 'string' ? input.prefix : undefined;
}

/** A publish between page reads shifts offsets by one; keep each artifact once. */
function dedupeArtifacts(pages: readonly ArtifactLibraryPage[] | undefined): ArtifactRecord[] {
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
