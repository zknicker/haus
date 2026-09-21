import type { ConfigureAgentInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { withSavingToast } from '../../lib/saving-toast.ts';
import { refreshAgent } from './agent-refresh.ts';

export function useAgentRuntime(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.agent.configure.useMutation({
        onSuccess: () => refreshAgent(utils, serverId, agentId),
    });

    return {
        ...mutation,
        save: async (
            draft: Pick<ConfigureAgentInput, 'modelId' | 'runtimeId' | 'reasoningEffort'>
        ) => {
            await withSavingToast(() => mutation.mutateAsync({ agentId, serverId, ...draft }));
        },
    };
}
