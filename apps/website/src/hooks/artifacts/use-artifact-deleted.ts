import type { ArtifactDeletedRecord } from '@haus/api';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

interface DeletedPage {
    deleted: ArtifactDeletedRecord[];
    next_offset: number | null;
}

export function useArtifactDeleted(serverId: string, folder: string) {
    const utils = hausTrpc.useUtils();
    const input = deletedInput(serverId, folder);
    const query = useInfiniteQuery({
        ...queryPolicy.syncedSnapshot,
        getNextPageParam: (lastPage: DeletedPage) => lastPage.next_offset ?? undefined,
        initialPageParam: 0,
        queryFn: async ({ pageParam }) =>
            await utils.client.artifact.listDeleted.query({ ...input, offset: pageParam }),
        queryKey: getQueryKey(hausTrpc.artifact.listDeleted, input, 'infinite'),
    });
    const pages = query.data?.pages;
    const deleted = React.useMemo(() => pages?.flatMap((page) => page.deleted) ?? null, [pages]);

    return {
        deleted,
        error: query.error,
        hasMore: query.hasNextPage,
        isFetchingMore: query.isFetchingNextPage,
        loadMore: () => void query.fetchNextPage(),
    };
}

export function deletedInput(serverId: string, folder: string) {
    return { prefix: folder, serverId };
}
