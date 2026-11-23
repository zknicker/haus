import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useAgentMachine(serverId: string, agentId: string) {
    return hausTrpc.agent.machine.useQuery({ agentId, serverId }, queryPolicy.syncedSnapshot);
}

export function useSetAgentMachine(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.agent.setMachine.useMutation({
        onSuccess: (machine) => {
            utils.agent.machine.setData({ agentId, serverId }, machine);
        },
    });
}
