import type { CloudAgentCapabilityState, CloudAgentProvider } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export interface CloudAgentCapabilityTarget {
    computerId: string;
    provider: CloudAgentProvider;
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

/**
 * The default is one flag across the Computer's providers, so every provider's
 * snapshot on that Computer is read again once it moves.
 */
export function useCloudAgentMakeDefault(target: CloudAgentCapabilityTarget) {
    const utils = hausTrpc.useUtils();
    const options = useCapabilityMutationOptions(target);
    return hausTrpc.cloudAgentProvider.makeDefault.useMutation({
        ...options,
        onSuccess: async (state: CloudAgentCapabilityState) => {
            await options.onSuccess(state);
            await utils.cloudAgentProvider.get.invalidate({
                computerId: target.computerId,
                serverId: target.serverId,
            });
        },
    });
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
