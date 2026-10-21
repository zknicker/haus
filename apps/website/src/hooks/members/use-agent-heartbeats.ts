import { keepPreviousData } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * Every heartbeat slot the Server ran, skipped, or paused in one window, a
 * lane per Agent (`agent.heartbeats`). `agentIds` narrows the read; omitted, it
 * covers every Agent. A settled run refreshes it from the Server shell's
 * lifecycle stream (`agent-history-cache.ts`), and a recorded skip, pause, or
 * yield from `agent.onUpdated`; nothing polls.
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
        }
    );
}
