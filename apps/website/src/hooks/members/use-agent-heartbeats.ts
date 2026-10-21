import type { AgentHeartbeats } from '@haus/api';
import { keepPreviousData } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

const runningRefetchMs = 15_000;

/**
 * Every heartbeat slot the Server ran, skipped, or paused in one window, a
 * lane per Agent (`agent.heartbeats`). `agentIds` narrows the read; omitted, it
 * covers every Agent. A settled run refreshes it from the Server shell's
 * lifecycle stream (`agent-history-cache.ts`); while a mark is still running the
 * read also repeats on a modest interval, since a run's progress is not an event.
 * Changing the window keeps the last day on screen until the next lands.
 */
export function useAgentHeartbeats(
    serverId: string,
    window: { from: string; to: string },
    agentIds?: readonly string[]
) {
    return hausTrpc.agent.heartbeats.useQuery(
        {
            ...(agentIds ? { agentIds: [...agentIds].sort() } : {}),
            from: window.from,
            serverId,
            to: window.to,
        },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: Boolean(serverId),
            placeholderData: keepPreviousData,
            refetchInterval: (query) =>
                hasRunningMark(query.state.data) ? runningRefetchMs : false,
        }
    );
}

function hasRunningMark(data: AgentHeartbeats | undefined): boolean {
    return Boolean(
        data?.lanes.some((lane) => lane.marks.some((mark) => mark.outcome === 'running'))
    );
}
