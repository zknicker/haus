import type { CloudAgentCapabilityState } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export interface CloudAgentCapabilityTarget {
    computerId: string;
    provider: 'cursor';
    serverId: string;
}

export function useCloudAgentCapability(target: CloudAgentCapabilityTarget, enabled: boolean) {
    return hausTrpc.cloudAgentProvider.get.useQuery(target, {
        ...queryPolicy.computerSnapshot,
        enabled,
        // Sign-in is volatile Computer state, with no durable Server event.
        refetchInterval: (query) => (query.state.data?.signIn?.status === 'waiting' ? 1000 : false),
        refetchOnWindowFocus: true,
        gcTime: 0,
    });
}

/**
 * Mutations seed the same snapshot the waiting-state query follows.
 */
export function useCloudAgentConnect(target: CloudAgentCapabilityTarget) {
    return hausTrpc.cloudAgentProvider.connect.useMutation(useCapabilityMutationOptions(target));
}

export function useCloudAgentDisconnect(target: CloudAgentCapabilityTarget) {
    return hausTrpc.cloudAgentProvider.disconnect.useMutation(useCapabilityMutationOptions(target));
}

export function useCloudAgentCancelSignIn(target: CloudAgentCapabilityTarget) {
    return hausTrpc.cloudAgentProvider.cancelSignIn.useMutation(
        useCapabilityMutationOptions(target)
    );
}

function useCapabilityMutationOptions(target: CloudAgentCapabilityTarget) {
    const utils = hausTrpc.useUtils();
    return {
        onSuccess: async (state: CloudAgentCapabilityState) => {
            // A read started before the mutation must not restore an old sign-in link.
            await utils.cloudAgentProvider.get.cancel(target);
            utils.cloudAgentProvider.get.setData(target, state);
        },
        onError: () => {
            void utils.cloudAgentProvider.get.invalidate(target);
        },
    };
}
