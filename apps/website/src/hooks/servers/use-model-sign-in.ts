import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useModelSignIn(serverId: string, signInId: string | null) {
    return hausTrpc.modelConnections.signIn.useQuery(
        { serverId, signInId: signInId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: signInId !== null }
    );
}

export function useStartModelSignIn(serverId: string) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.modelConnections.startSignIn.useMutation({
        onSuccess: (signIn) => {
            utils.modelConnections.signIn.setData({ serverId, signInId: signIn.signInId }, signIn);
        },
    });
}

export function useCancelModelSignIn(serverId: string) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.modelConnections.cancelSignIn.useMutation({
        onSuccess: (result) => {
            if (result.cancelled) {
                utils.modelConnections.signIn.setData(
                    { serverId, signInId: result.signIn.signInId },
                    result.signIn
                );
            }
        },
    });
}
