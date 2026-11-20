import type { ModelSignInStartInput } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useModelSignIn(serverId: string, signInId: string | null) {
    return hausTrpc.modelConnections.signIn.useQuery(
        { serverId, signInId: signInId ?? '' },
        { ...queryPolicy.syncedSnapshot, enabled: signInId !== null, gcTime: 0 }
    );
}

export function useStartModelSignIn(serverId: string) {
    const utils = hausTrpc.useUtils();
    const mounted = React.useRef(true);
    React.useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const mutation = hausTrpc.modelConnections.startSignIn.useMutation({
        onSuccess: (signIn) => {
            const target = { serverId, signInId: signIn.signInId };
            utils.modelConnections.signIn.setData(target, signIn);
            void utils.modelConnections.signIn.invalidate(target);
        },
    });

    return {
        ...mutation,
        start: async (input: ModelSignInStartInput) => {
            const signIn = await mutation.mutateAsync(input);
            if (mounted.current) {
                return signIn;
            }
            await utils.client.modelConnections.cancelSignIn.mutate({
                serverId,
                signInId: signIn.signInId,
            });
            return null;
        },
    };
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
