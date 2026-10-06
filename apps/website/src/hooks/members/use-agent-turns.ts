import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

const turnLimit = 50;

export function useAgentTurns(serverId: string, agentId: string, limit = turnLimit) {
    const utils = hausTrpc.useUtils();
    const input = { agentId, limit, serverId };

    hausTrpc.agent.onLifecycle.useSubscription(
        { serverId },
        {
            enabled: Boolean(serverId && agentId),
            onData: (event) => {
                if (event.agentId === agentId && event.phase === 'settled') {
                    void utils.agent.turns.invalidate(input);
                }
            },
            onStarted: () => void utils.agent.turns.invalidate(input),
        }
    );

    return hausTrpc.agent.turns.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled: Boolean(serverId && agentId),
    });
}

export function useAgentTurn(serverId: string, agentId: string, runId: string | null) {
    const utils = hausTrpc.useUtils();
    const input = { agentId, limit: 1, runId: runId ?? 'run_missing', serverId };

    hausTrpc.agent.onLifecycle.useSubscription(
        { serverId },
        {
            enabled: Boolean(serverId && agentId && runId),
            onData: (event) => {
                if (
                    event.agentId === agentId &&
                    event.runId === runId &&
                    event.phase === 'settled'
                ) {
                    void utils.agent.turns.invalidate(input);
                }
            },
        }
    );
    return hausTrpc.agent.turns.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled: Boolean(serverId && agentId && runId),
    });
}
