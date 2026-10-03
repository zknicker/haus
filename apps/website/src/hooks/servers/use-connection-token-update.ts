import { hausTrpc } from '../../lib/haus-server.tsx';

export function useConnectionTokenUpdate(serverId: string) {
    const utils = hausTrpc.useUtils();

    return hausTrpc.mcp.replacePresetToken.useMutation({
        onSuccess: () => utils.mcp.list.invalidate({ serverId }),
    });
}
