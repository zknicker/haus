import type { AgentTurnTrigger } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * What woke a run that has not settled yet, so its row and the hover card can
 * be titled while it works. A run's trigger is fixed at dispatch, so one read
 * per run is enough. `undefined` while the read is out; null when the Server
 * recorded none or no run is given.
 */
export function useAgentRunTrigger(
    serverId: string,
    agentId: string,
    runId: string | null
): AgentTurnTrigger | null | undefined {
    const enabled = Boolean(serverId && agentId && runId);
    const query = hausTrpc.agent.runTrigger.useQuery(
        { agentId, runId: runId ?? 'run_missing', serverId },
        { ...queryPolicy.syncedSnapshot, enabled }
    );
    if (!enabled) {
        return null;
    }
    if (query.data) {
        return query.data.trigger;
    }
    // A failed read leaves the row untitled rather than pending forever.
    return query.isError ? null : undefined;
}
