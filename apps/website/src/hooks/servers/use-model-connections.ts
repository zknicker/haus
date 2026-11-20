import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useModelConnections(serverId: string) {
    return hausTrpc.modelConnections.list.useQuery({ serverId }, queryPolicy.syncedSnapshot);
}

export function useModelConnectionEdits(serverId: string) {
    const utils = hausTrpc.useUtils();
    const refresh = () => {
        void utils.modelConnections.list.invalidate({ serverId });
    };
    return {
        add: hausTrpc.modelConnections.add.useMutation({ onSuccess: refresh }),
        makeDefault: hausTrpc.modelConnections.makeDefault.useMutation({ onSuccess: refresh }),
        remove: hausTrpc.modelConnections.remove.useMutation({ onSuccess: refresh }),
        rename: hausTrpc.modelConnections.rename.useMutation({ onSuccess: refresh }),
        setWebSearch: hausTrpc.modelConnections.setWebSearch.useMutation({ onSuccess: refresh }),
    };
}

export function useReplaceModelConnection(serverId: string) {
    const utils = hausTrpc.useUtils();
    const makeDefault = hausTrpc.modelConnections.makeDefault.useMutation();
    const remove = hausTrpc.modelConnections.remove.useMutation();
    const rename = hausTrpc.modelConnections.rename.useMutation();

    return async (replaced: { id: string; isDefault: boolean; label: string }, next: string) => {
        try {
            if (replaced.isDefault) {
                await makeDefault.mutateAsync({ connectionId: next, serverId });
            }
            await remove.mutateAsync({ connectionId: replaced.id, serverId });
            await rename.mutateAsync({ connectionId: next, label: replaced.label, serverId });
        } finally {
            void utils.modelConnections.list.invalidate({ serverId });
        }
    };
}
