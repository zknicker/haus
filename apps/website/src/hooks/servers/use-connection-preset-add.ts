import { hausTrpc } from '../../lib/haus-server.tsx';

export function useConnectionPresetAdd(serverId: string) {
    const utils = hausTrpc.useUtils();

    return hausTrpc.mcp.addPresetAccount.useMutation({
        onSuccess: (created) => {
            // Listed before the refetch lands, so opening the new connection's
            // page right away finds it instead of redirecting to the list.
            utils.mcp.list.setData({ serverId }, (connections) =>
                connections && !connections.some((connection) => connection.id === created.id)
                    ? [...connections, created]
                    : connections
            );
            return utils.mcp.list.invalidate({ serverId });
        },
    });
}
