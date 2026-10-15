import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/** The Agent that answers a Linear mention or delegation no Agent label names. */
export function useLinearSetDefaultAgent(serverId: string, connectionId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.linear.setDefaultAgent.useMutation({
        onError: (error) =>
            toast.danger('Could not change the default Agent', { description: error.message }),
        onSuccess: async () => await utils.linear.workspaces.invalidate({ serverId }),
    });

    return {
        isPending: mutation.isPending,
        setDefaultAgent: (agentId: string | null) =>
            mutation.mutate({ agentId, connectionId, serverId }),
    };
}
