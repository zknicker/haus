import type { HeartbeatLane } from '@haus/api';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import {
    mergeLanes,
    readNextPageIndex,
    readPageWindow,
} from '../../features/servers/activity/heartbeats/heartbeats-model.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Every heartbeat slot the Server ran, skipped, or paused, a lane per Agent
 * (`agent.heartbeats`), read backward a few local days per page: one request per
 * page, never one per day or Agent. The read always spans every Agent; the feed
 * narrows it itself so the roster keeps every Agent's status. A settled run
 * refreshes the loaded pages from the Server shell's lifecycle stream
 * (`agent-history-cache.ts`), and a recorded skip, pause, or yield from
 * `agent.onUpdated`; nothing polls.
 */
export function useAgentHeartbeats(serverId: string) {
    const utils = hausTrpc.useUtils();
    const query = useInfiniteQuery({
        ...queryPolicy.syncedSnapshot,
        enabled: Boolean(serverId),
        getNextPageParam: (page: { index: number; lanes: HeartbeatLane[] }) =>
            readNextPageIndex(page.index, page.lanes) ?? undefined,
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => ({
            index: pageParam,
            lanes: (
                await utils.client.agent.heartbeats.query({
                    ...readPageWindow(pageParam, Date.now()),
                    serverId,
                })
            ).lanes,
        }),
        queryKey: getQueryKey(hausTrpc.agent.heartbeats, { serverId }, 'infinite'),
    });
    const pages = query.data?.pages;
    const lanes = React.useMemo(() => mergeLanes((pages ?? []).map((page) => page.lanes)), [pages]);
    const { fetchNextPage } = query;
    const loadMore = React.useCallback(() => void fetchNextPage(), [fetchNextPage]);

    return {
        error: query.error,
        hasMore: Boolean(query.hasNextPage),
        isFetchingMore: query.isFetchingNextPage,
        isPending: query.isPending,
        lanes,
        loadMore,
    };
}
