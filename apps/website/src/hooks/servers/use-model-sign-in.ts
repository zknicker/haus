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
            const target = { serverId, signInId: signIn.signInId };
            utils.modelConnections.signIn.setData(target, signIn);
            void utils.modelConnections.signIn.invalidate(target);
        },
    });
}

export function useCancelModelSignIn(serverId: string) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.modelConnections.cancelSignIn.useMutation({
        onSuccess: async (result, target) => {
            await utils.modelConnections.signIn.cancel(target);
            if (result.cancelled) {
                utils.modelConnections.signIn.setData(target, result.signIn);
                return;
            }
            await Promise.all([
                utils.modelConnections.signIn.invalidate(target),
                utils.modelConnections.list.invalidate({ serverId }),
            ]);
        },
    });
}
