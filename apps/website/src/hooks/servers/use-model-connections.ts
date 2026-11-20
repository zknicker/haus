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
        replaceCredential: hausTrpc.modelConnections.replaceCredential.useMutation({
            onSuccess: refresh,
        }),
        setWebSearch: hausTrpc.modelConnections.setWebSearch.useMutation({ onSuccess: refresh }),
    };
}
