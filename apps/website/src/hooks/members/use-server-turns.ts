import type { AgentTurn, ServerTurnsCursor } from '@haus/api';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

const pageSize = 30;

/**
 * Every Agent's settled turns on one Server, newest first, a page at a time
 * (`agent.serverTurns`): one request per page, never one per Agent. `agentIds`
 * narrows the read; omitted, it covers every Agent. A settled turn anywhere on
 * the Server refreshes the loaded pages.
 */
export function useServerTurns(serverId: string, agentIds?: readonly string[]) {
    const utils = hausTrpc.useUtils();
    const client = useQueryClient();
    const input = {
        ...(agentIds ? { agentIds: [...agentIds].sort() } : {}),
        limit: pageSize,
        serverId,
    };
    const queryKey = getQueryKey(hausTrpc.agent.serverTurns, input, 'infinite');

    const invalidate = () => void client.invalidateQueries({ queryKey });
    hausTrpc.agent.onLifecycle.useSubscription(
        { serverId },
        {
            enabled: Boolean(serverId),
            onData: (event) => {
                if (event.phase === 'settled') {
                    invalidate();
                }
            },
            onStarted: invalidate,
        }
    );

    const query = useInfiniteQuery({
        ...queryPolicy.syncedSnapshot,
        enabled: Boolean(serverId),
        getNextPageParam: (page: { nextBefore: ServerTurnsCursor | null }) =>
            page.nextBefore ?? undefined,
        initialPageParam: undefined as ServerTurnsCursor | undefined,
        // A filter change keeps the last pages (the log filters them itself)
        // until the narrowed read lands, so the day bar never blanks.
        placeholderData: keepPreviousData,
        queryFn: async ({ pageParam }) =>
            await utils.client.agent.serverTurns.query(
                pageParam ? { ...input, before: pageParam } : input
            ),
        queryKey,
    });
    const pages = query.data?.pages;
    const turns = React.useMemo<AgentTurn[]>(() => dedupeTurns(pages), [pages]);

    return {
        error: query.error,
        hasMore: Boolean(query.hasNextPage),
        isFetchingMore: query.isFetchingNextPage,
        isPending: query.isPending,
        loadMore: () => void query.fetchNextPage(),
        turns,
    };
}

/** A turn settling between page reads can shift a page edge; keep each run once. */
function dedupeTurns(pages: readonly { turns: readonly AgentTurn[] }[] | undefined): AgentTurn[] {
    const seen = new Set<string>();
    return (pages ?? []).flatMap((page) =>
        page.turns.filter((turn) => {
            const key = `${turn.agentId}:${turn.runId}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        })
    );
}
