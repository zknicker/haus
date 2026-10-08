import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

const turnLimit = 50;

/** The settled-turn read an Agent's profile and Activity section share. */
export function agentTurnsInput(serverId: string, agentId: string, limit = turnLimit) {
    return { agentId, limit, serverId };
}

/**
 * An Agent's settled turns. A run settling invalidates every turn read of its
 * Agent from the Server shell's lifecycle stream (`agent-history-cache.ts`), so
 * a mount with a fresh cache reads nothing.
 */
export function useAgentTurns(serverId: string, agentId: string, limit = turnLimit) {
    return hausTrpc.agent.turns.useQuery(agentTurnsInput(serverId, agentId, limit), {
        ...queryPolicy.syncedSnapshot,
        enabled: Boolean(serverId && agentId),
    });
}

export function useAgentTurn(serverId: string, agentId: string, runId: string | null) {
    return hausTrpc.agent.turns.useQuery(
        { agentId, limit: 1, runId: runId ?? 'run_missing', serverId },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: Boolean(serverId && agentId && runId),
        }
    );
}
