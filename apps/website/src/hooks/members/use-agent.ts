import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useAgent(serverId: string, agentId: string | undefined) {
    return hausTrpc.agent.get.useQuery(
        { agentId: agentId ?? '', serverId },
        { ...queryPolicy.syncedSnapshot, enabled: agentId !== undefined }
    );
}

/**
 * The Agent's name while it is stopped, else null: what a stopped-Agent notice
 * shows. Agent records change on every turn; a reader re-renders only when
 * this does.
 */
export function useStoppedAgentName(serverId: string, agentId: string): string | null {
    return (
        hausTrpc.agent.get.useQuery(
            { agentId, serverId },
            { ...queryPolicy.syncedSnapshot, select: selectStoppedName }
        ).data ?? null
    );
}

function selectStoppedName(agent: { availability: string; displayName: string }) {
    return agent.availability === 'stopped' ? agent.displayName : null;
}
