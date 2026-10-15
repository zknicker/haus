import type { AgentExecutionOutline } from '@haus/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    createReadGate,
    indexOutlines,
    isSettledOutlineEntry,
    readTurnOutlines,
    turnOutlinesKey,
} from './turn-outlines.ts';

/** Settled outlines are immutable; keep them while the log is in use. */
const outlinesGcMs = 30 * 60_000;

/** Every log in this window shares one gate: at most 3 outline reads in flight. */
const outlineReads = createReadGate(3);

/**
 * The compact outlines of one Agent's settled turns, read in one batched
 * request (`agent.executionOutlines`) per set of runs. Settled outlines are
 * reused across days and revisits and never read again; runs whose outline has
 * not synced yet read again whenever the query is next used.
 */
export function useTurnOutlines({
    agentId,
    enabled,
    runIds,
    serverId,
}: {
    agentId: string;
    enabled: boolean;
    runIds: readonly string[];
    serverId: string;
}): ReadonlyMap<string, AgentExecutionOutline> {
    const client = useQueryClient();
    const utils = hausTrpc.useUtils();
    const sorted = [...runIds].sort();

    const outlines = useQuery({
        enabled: enabled && sorted.length > 0,
        gcTime: outlinesGcMs,
        queryFn: () =>
            readTurnOutlines({
                agentId,
                client,
                fetch: async (pending) =>
                    (
                        await outlineReads(() =>
                            utils.client.agent.executionOutlines.query({
                                agentId,
                                runIds: pending,
                                serverId,
                            })
                        )
                    ).outlines,
                runIds: sorted,
                serverId,
            }),
        queryKey: [...turnOutlinesKey(serverId, agentId), sorted],
        refetchOnReconnect: false,
        retry: false,
        staleTime: (query) =>
            query.state.data?.every(isSettledOutlineEntry) ? Number.POSITIVE_INFINITY : 0,
    });
    return indexOutlines(outlines.data);
}
